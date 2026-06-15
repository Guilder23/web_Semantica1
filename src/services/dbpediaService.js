const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const { Parser, DataFactory } = require('n3');
const { create } = require('xmlbuilder2');
const dbpediaConfig = require('../config/dbpedia');
const { searchSoftware } = require('../utils/sparqlQueries');

const { namedNode } = DataFactory;
const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const DBC_NS = 'http://example.org/dbpedia-cache#';
const DBC_SEARCH_ENTRY = namedNode(`${DBC_NS}SearchEntry`);
const DBC_DETAIL_ENTRY = namedNode(`${DBC_NS}DetailEntry`);
const DBC_KEY = namedNode(`${DBC_NS}key`);
const DBC_UPDATED_AT = namedNode(`${DBC_NS}updatedAt`);
const DBC_PAYLOAD = namedNode(`${DBC_NS}payload`);

class DBpediaService {
  constructor() {
    this.cacheFilePath = path.join(__dirname, '../public/data/calidadSoftware.owl');
    this.cache = null;
  }

  _getEndpoint() {
    return dbpediaConfig.endpoint;
  }

  async _ensureCacheLoaded() {
    if (this.cache) return;

    try {
      const raw = await fs.readFile(this.cacheFilePath, 'utf8');
      this.cache = this._parseCacheFromOwl(raw);
    } catch {
      this.cache = { search: {}, details: {} };
    }
  }

  async _persistCache() {
    await this._ensureCacheLoaded();
    await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
    const owlContent = await this._serializeCacheToOwl();
    await fs.writeFile(this.cacheFilePath, owlContent, 'utf8');
  }

  _normalizeCache(cache) {
    return {
      search: cache?.search || {},
      details: cache?.details || {}
    };
  }

  _parseCacheFromOwl(raw) {
    const content = String(raw || '').trim();
    if (!content) {
      return { search: {}, details: {} };
    }

    // Si es JSON antiguo, lo normaliza
    if (content.startsWith('{') && !content.startsWith('<?xml')) {
      return this._normalizeCache(JSON.parse(content));
    }

    // Parsea el RDF/XML como Turtle (N3 lo maneja igual)
    const parser = new Parser();
    const quads = parser.parse(content);
    const indexed = new Map();

    for (const item of quads) {
      const subject = item.subject.value;
      if (!indexed.has(subject)) {
        indexed.set(subject, { type: null, key: null, updatedAt: null, payload: null });
      }

      const current = indexed.get(subject);
      const predicate = item.predicate.value;

      if (predicate === RDF_TYPE.value) {
        current.type = item.object.value;
      }

      if (predicate === DBC_KEY.value && item.object.termType === 'Literal') {
        current.key = item.object.value;
      }

      if (predicate === DBC_UPDATED_AT.value && item.object.termType === 'Literal') {
        current.updatedAt = item.object.value;
      }

      if (predicate === DBC_PAYLOAD.value && item.object.termType === 'Literal') {
        current.payload = item.object.value;
      }
    }

    const cache = { search: {}, details: {} };

    for (const entry of indexed.values()) {
      if (!entry.key || !entry.payload) {
        continue;
      }

      let parsedPayload;
      try {
        parsedPayload = JSON.parse(entry.payload);
      } catch {
        continue;
      }

      if (entry.type === DBC_SEARCH_ENTRY.value) {
        cache.search[entry.key] = {
          updatedAt: entry.updatedAt || new Date().toISOString(),
          results: Array.isArray(parsedPayload) ? parsedPayload : []
        };
      }

      if (entry.type === DBC_DETAIL_ENTRY.value) {
        cache.details[entry.key] = {
          updatedAt: entry.updatedAt || new Date().toISOString(),
          details: parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : null
        };
      }
    }

    return cache;
  }

  async _serializeCacheToOwl() {
    const doc = create({ version: '1.0', encoding: 'UTF-8' });
    const rdf = doc.ele('rdf:RDF', {
      'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'xmlns:dbc': DBC_NS,
      'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema#',
      'xmlns:owl': 'http://www.w3.org/2002/07/owl#'
    });

    // Agregar búsquedas
    for (const [key, value] of Object.entries(this.cache.search || {})) {
      const searchEntry = rdf.ele('rdf:Description', {
        'rdf:about': `${DBC_NS}search/${encodeURIComponent(key)}`
      });
      
      searchEntry.ele('rdf:type', {
        'rdf:resource': `${DBC_NS}SearchEntry`
      });
      
      searchEntry.ele('dbc:key').txt(key);
      searchEntry.ele('dbc:updatedAt', {
        'rdf:datatype': 'http://www.w3.org/2001/XMLSchema#dateTime'
      }).txt(value.updatedAt || new Date().toISOString());
      
      searchEntry.ele('dbc:payload').txt(JSON.stringify(value.results || []));
    }

    // Agregar detalles
    for (const [key, value] of Object.entries(this.cache.details || {})) {
      const detailEntry = rdf.ele('rdf:Description', {
        'rdf:about': `${DBC_NS}details/${encodeURIComponent(key)}`
      });
      
      detailEntry.ele('rdf:type', {
        'rdf:resource': `${DBC_NS}DetailEntry`
      });
      
      detailEntry.ele('dbc:key').txt(key);
      detailEntry.ele('dbc:updatedAt', {
        'rdf:datatype': 'http://www.w3.org/2001/XMLSchema#dateTime'
      }).txt(value.updatedAt || new Date().toISOString());
      
      detailEntry.ele('dbc:payload').txt(JSON.stringify(value.details || null));
    }

    return doc.end({ prettyPrint: true });
  }

  _searchKey(term, lang) {
    return `${lang}:${String(term || '').trim().toLowerCase()}`;
  }

  _detailsKey(uri, lang) {
    return `${lang}:${uri}`;
  }

  async _setSearchCache(term, lang, results) {
    await this._ensureCacheLoaded();
    this.cache.search[this._searchKey(term, lang)] = {
      updatedAt: new Date().toISOString(),
      results
    };
    await this._persistCache();
  }

  async _setDetailsCache(uri, lang, details) {
    await this._ensureCacheLoaded();
    this.cache.details[this._detailsKey(uri, lang)] = {
      updatedAt: new Date().toISOString(),
      details
    };
    await this._persistCache();
  }

  async _getSearchFromCache(term, lang) {
    await this._ensureCacheLoaded();
    const direct = this.cache.search[this._searchKey(term, lang)]?.results;
    if (direct) return direct;

    if (lang !== 'en') {
      const fallbackEn = this.cache.search[this._searchKey(term, 'en')]?.results;
      if (fallbackEn) return fallbackEn;
    }

    return [];
  }

  async _getDetailsFromCache(uri, lang) {
    await this._ensureCacheLoaded();
    const direct = this.cache.details[this._detailsKey(uri, lang)]?.details;
    if (direct) return direct;

    if (lang !== 'en') {
      const fallbackEn = this.cache.details[this._detailsKey(uri, 'en')]?.details;
      if (fallbackEn) return fallbackEn;
    }

    return null;
  }

  async searchSoftware(term, lang = 'es') {
    const endpoint = this._getEndpoint();
    const query = searchSoftware(term, lang);

    try {
      const response = await axios.get(endpoint, {
        params: {
          ...dbpediaConfig.defaultQueryOptions,
          query
        }
      });

      if (!response.data || !response.data.results) {
        throw new Error('Invalid response structure from DBpedia');
      }

      const results = response.data.results.bindings.map(result => ({
        uri: result.entity?.value,
        label: result.label?.value || result.name?.value,
        abstract: result.abstract?.value || result.description?.value,
        developer: result.developer?.value,
        programmingLanguage: result.programmingLanguage?.value,
        latestReleaseVersion: result.latestReleaseVersion?.value,
        license: result.license?.value,
        dbpediaPage: result.entity?.value,
        thumbnail: result.thumbnail?.value
      }));

      await this._setSearchCache(term, lang, results);
      return results;
    } catch (error) {
      this._handleError(error);
      return this._getSearchFromCache(term, lang);
    }
  }

  async getSoftwareDetails(uri, lang = 'es') {
    const endpoint = this._getEndpoint();

    const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbp: <http://dbpedia.org/property/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      SELECT DISTINCT ?label ?abstract ?developer ?programmingLanguage ?latestReleaseVersion ?license ?operatingSystem ?repository ?homepage ?thumbnail WHERE {
        BIND(<${uri}> AS ?software)
        ?software rdfs:label ?label .
        FILTER(LANG(?label) = "${lang}" || LANG(?label) = "en")

        OPTIONAL { ?software dbo:abstract ?abstract . FILTER(LANG(?abstract)="${lang}" || LANG(?abstract)="en") }
        OPTIONAL { ?software dbo:developer ?developer }
        OPTIONAL { ?software dbp:programmingLanguage ?programmingLanguage }
        OPTIONAL { ?software dbo:latestReleaseVersion ?latestReleaseVersion }
        OPTIONAL { ?software dbo:license ?license }
        OPTIONAL { ?software dbo:operatingSystem ?operatingSystem }
        OPTIONAL { ?software dbo:repository ?repository }
        OPTIONAL { ?software foaf:homepage ?homepage }
        OPTIONAL { ?software dbo:thumbnail ?thumbnail }
      }
      LIMIT 200
    `;

    try {
      const response = await axios.get(endpoint, {
        params: {
          ...dbpediaConfig.defaultQueryOptions,
          query
        }
      });

      const rows = response.data.results.bindings;

      if (!rows || rows.length === 0) {
        return null;
      }

      const base = rows[0];

      const collectUnique = (key) => {
        const values = rows
          .map(r => r[key]?.value)
          .filter(Boolean);
        return Array.from(new Set(values));
      };

      const details = {
        uri,
        label: base.label?.value,
        abstract: base.abstract?.value,
        descripcion: base.abstract?.value,
        tipo: collectUnique('programmingLanguage').join(', '),
        developer: collectUnique('developer'),
        programmingLanguages: collectUnique('programmingLanguage'),
        operatingSystems: collectUnique('operatingSystem'),
        repositories: collectUnique('repository'),
        homepages: collectUnique('homepage'),
        latestReleaseVersion: base.latestReleaseVersion?.value,
        license: base.license?.value,
        thumbnail: base.thumbnail?.value
      };

      await this._setDetailsCache(uri, lang, details);
      return details;
    } catch (error) {
      this._handleError(error);
      return this._getDetailsFromCache(uri, lang);
    }
  }

  // Aliases para compatibilidad con controladores existentes
  async searchDiseases(term, lang = 'es') {
    return this.searchSoftware(term, lang);
  }

  async getDiseaseDetails(uri, lang = 'es') {
    return this.getSoftwareDetails(uri, lang);
  }

  _handleError(error) {
    console.error('DBpedia Service Error:');
    console.error(`- Message: ${error.message}`);
    if (error.response) {
      console.error(`- Status: ${error.response.status}`);
      console.error(`- Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

module.exports = new DBpediaService();
