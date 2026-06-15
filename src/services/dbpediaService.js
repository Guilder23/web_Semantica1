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
    
    const cache = { search: {}, details: {} };
    const searches = new Map();
    const details = new Map();
    const software = new Map();

    // Primera pasada: recopilar datos
    for (const item of quads) {
      const subject = item.subject.value;
      const predicate = item.predicate.value;

      // Índicar software
      if (predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && 
          item.object.value.includes('Software')) {
        if (!software.has(subject)) {
          software.set(subject, {});
        }
      }

      // Propiedades de software
      if (software.has(subject)) {
        if (predicate === 'http://www.w3.org/2000/01/rdf-schema#label' && item.object.termType === 'Literal') {
          software.get(subject).label = item.object.value;
        }
        if (predicate.includes('developer')) {
          software.get(subject).developer = item.object.value;
        }
        if (predicate.includes('programmingLanguage')) {
          software.get(subject).programmingLanguage = item.object.value;
        }
        if (predicate.includes('license')) {
          software.get(subject).license = item.object.value;
        }
        if (predicate === `${DBC_NS}latestReleaseVersion` && item.object.termType === 'Literal') {
          software.get(subject).latestReleaseVersion = item.object.value;
        }
        if (predicate === `${DBC_NS}thumbnail`) {
          software.get(subject).thumbnail = item.object.value;
        }
      }

      // Búsquedas
      if (predicate === `${DBC_NS}cacheKey` && item.object.termType === 'Literal') {
        if (!searches.has(subject)) {
          searches.set(subject, { key: item.object.value, results: [] });
        } else {
          searches.get(subject).key = item.object.value;
        }
      }

      if (predicate === `${DBC_NS}updatedAt` && subject.includes('search/')) {
        if (!searches.has(subject)) {
          searches.set(subject, { results: [] });
        }
        searches.get(subject).updatedAt = item.object.value;
      }

      if (predicate === `${DBC_NS}hasCachedResult`) {
        if (!searches.has(subject)) {
          searches.set(subject, { results: [] });
        }
        searches.get(subject).results.push(item.object.value);
      }

      // Detalles
      if (predicate === `${DBC_NS}cacheKey` && item.object.termType === 'Literal' && subject.includes('details/')) {
        if (!details.has(subject)) {
          details.set(subject, { key: item.object.value });
        } else {
          details.get(subject).key = item.object.value;
        }
      }

      if (predicate === `${DBC_NS}updatedAt` && subject.includes('details/')) {
        if (!details.has(subject)) {
          details.set(subject, {});
        }
        details.get(subject).updatedAt = item.object.value;
      }
    }

    // Construir caché con software completo
    for (const [searchUri, searchData] of searches.entries()) {
      if (!searchData.key) continue;

      const results = [];
      for (const softwareUri of searchData.results) {
        if (software.has(softwareUri)) {
          results.push({
            uri: softwareUri,
            ...software.get(softwareUri)
          });
        }
      }

      cache.search[searchData.key] = {
        updatedAt: searchData.updatedAt || new Date().toISOString(),
        results
      };
    }

    for (const [detailsUri, detailsData] of details.entries()) {
      if (!detailsData.key) continue;

      cache.details[detailsData.key] = {
        updatedAt: detailsData.updatedAt || new Date().toISOString(),
        details: detailsData.uri || null
      };
    }

    return cache;
  }

  async _serializeCacheToOwl() {
    const doc = create({ version: '1.0', encoding: 'UTF-8' });
    const rdf = doc.ele('rdf:RDF', {
      'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'xmlns:rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'xmlns:owl': 'http://www.w3.org/2002/07/owl#',
      'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema#',
      'xmlns:dbpedia': 'http://dbpedia.org/ontology/',
      'xmlns:dbpedia-res': 'http://dbpedia.org/resource/',
      'xmlns:dbc': DBC_NS
    });

    // Ontología
    const ontology = rdf.ele('owl:Ontology', {
      'rdf:about': DBC_NS
    });
    ontology.ele('rdfs:label').txt('DBpedia Semantic Cache');
    ontology.ele('rdfs:comment').txt('Caché semántico estructurado de recursos DBpedia');
    ontology.ele('owl:versionInfo').txt('1.0');

    // Definir clases OWL
    const softwareClass = rdf.ele('owl:Class', {
      'rdf:about': `${DBC_NS}Software`
    });
    softwareClass.ele('rdfs:label').txt('Software');
    softwareClass.ele('rdfs:comment').txt('Representa un recurso de software');

    // Agregar búsquedas y software como Individuos
    const addedSoftware = new Set();

    for (const [key, value] of Object.entries(this.cache.search || {})) {
      // Entry de búsqueda
      const searchEntry = rdf.ele('rdf:Description', {
        'rdf:about': `${DBC_NS}search/${encodeURIComponent(key)}`
      });
      
      searchEntry.ele('rdf:type', {
        'rdf:resource': 'http://example.org/dbpedia-cache#SearchCache'
      });
      
      searchEntry.ele('dbc:cacheKey').txt(key);
      searchEntry.ele('dbc:updatedAt', {
        'rdf:datatype': 'http://www.w3.org/2001/XMLSchema#dateTime'
      }).txt(value.updatedAt || new Date().toISOString());

      // Crear Individuos para cada software en los resultados
      const results = Array.isArray(value.results) ? value.results : [];
      for (const result of results) {
        if (!result.uri) continue;
        
        // Solo crear Individual si no existe ya
        if (!addedSoftware.has(result.uri)) {
          addedSoftware.add(result.uri);
          
          const softwareIndividual = rdf.ele('rdf:Description', {
            'rdf:about': result.uri
          });
          
          softwareIndividual.ele('rdf:type', {
            'rdf:resource': `${DBC_NS}Software`
          });
          
          if (result.label) {
            softwareIndividual.ele('rdfs:label').txt(result.label);
          }
          
          if (result.developer) {
            softwareIndividual.ele('dbpedia:developer', {
              'rdf:resource': result.developer
            });
          }
          
          if (result.programmingLanguage) {
            softwareIndividual.ele('dbpedia:programmingLanguage', {
              'rdf:resource': result.programmingLanguage
            });
          }
          
          if (result.license) {
            softwareIndividual.ele('dbpedia:license', {
              'rdf:resource': result.license
            });
          }
          
          if (result.latestReleaseVersion) {
            softwareIndividual.ele('dbc:latestReleaseVersion')
              .txt(result.latestReleaseVersion);
          }
          
          if (result.thumbnail) {
            softwareIndividual.ele('dbc:thumbnail', {
              'rdf:resource': result.thumbnail
            });
          }
          
          softwareIndividual.ele('rdfs:seeAlso', {
            'rdf:resource': result.uri
          });
        }
        
        // Vincular búsqueda con software
        searchEntry.ele('dbc:hasCachedResult', {
          'rdf:resource': result.uri
        });
      }
    }

    // Agregar detalles
    for (const [key, value] of Object.entries(this.cache.details || {})) {
      const detailEntry = rdf.ele('rdf:Description', {
        'rdf:about': `${DBC_NS}details/${encodeURIComponent(key)}`
      });
      
      detailEntry.ele('rdf:type', {
        'rdf:resource': `${DBC_NS}DetailCache`
      });
      
      detailEntry.ele('dbc:cacheKey').txt(key);
      detailEntry.ele('dbc:updatedAt', {
        'rdf:datatype': 'http://www.w3.org/2001/XMLSchema#dateTime'
      }).txt(value.updatedAt || new Date().toISOString());

      // Vincular a recurso DBpedia si existe
      if (value.details && value.details.uri) {
        detailEntry.ele('dbc:dbpediaReference', {
          'rdf:resource': value.details.uri
        });
      }
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
