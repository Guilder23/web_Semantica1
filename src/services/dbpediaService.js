const axios = require('axios');
const dbpediaConfig = require('../config/dbpedia');

class DBpediaService {
  constructor() {
    this.softwareQualityKeywords = [
      'software quality',
      'quality assurance',
      'software testing',
      'testing',
      'test automation',
      'unit testing',
      'integration testing',
      'regression testing',
      'code quality',
      'maintainability',
      'reliability',
      'usability',
      'security',
      'performance',
      'scalability',
      'portability',
      'reusability',
      'modularity',
      'refactoring',
      'technical debt',
      'static analysis',
      'code review',
      'verification and validation',
      'defect',
      'bug',
      'code smell'
    ];

    this.queryAliases = {
      'calidad de software': ['software quality', 'quality assurance', 'software testing'],
      'quality of software': ['software quality'],
      'pruebas': ['testing', 'software testing'],
      'testing': ['testing', 'software testing'],
      'mantenibilidad': ['maintainability'],
      'confiabilidad': ['reliability'],
      'usabilidad': ['usability'],
      'seguridad': ['security'],
      'rendimiento': ['performance'],
      'escalabilidad': ['scalability'],
      'portabilidad': ['portability'],
      'reusabilidad': ['reusability'],
      'reutilizacion': ['reusability'],
      'modularidad': ['modularity'],
      'refactorizacion': ['refactoring'],
      'deuda tecnica': ['technical debt'],
      'analisis estatico': ['static analysis'],
      'revision de codigo': ['code review'],
      'verificacion y validacion': ['verification and validation'],
      'defecto': ['defect', 'bug'],
      'bugs': ['bug'],
      'code smell': ['code smell']
    };
  }

  _getEndpoint() {
    return dbpediaConfig.endpoint;
  }

  _lookupEndpoint() {
    return 'https://lookup.dbpedia.org/api/search/KeywordSearch';
  }

  _normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  _resourceNameFromUri(uri) {
    if (!uri) {
      return '';
    }

    return decodeURIComponent(String(uri).split('/').pop());
  }

  _extractTag(block, tag) {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
  }

  _parseLookupResults(xmlText) {
    const resultBlocks = xmlText.match(/<Result>[\s\S]*?<\/Result>/gi) || [];

    return resultBlocks.map(block => {
      const categoryBlocks = block.match(/<Category>[\s\S]*?<\/Category>/gi) || [];
      const categories = categoryBlocks.map(categoryBlock => ({
        label: this._extractTag(categoryBlock, 'Label'),
        uri: this._extractTag(categoryBlock, 'URI')
      }));

      return {
        uri: this._extractTag(block, 'URI'),
        label: this._extractTag(block, 'Label'),
        abstract: this._extractTag(block, 'Description'),
        description: this._extractTag(block, 'Description'),
        categories,
        refcount: Number(this._extractTag(block, 'Refcount') || 0),
        dbpediaPage: this._extractTag(block, 'URI')
      };
    });
  }

  _buildLookupQueries(term) {
    const normalizedTerm = this._normalizeText(term).trim();
    const queries = [
      normalizedTerm,
      `software ${normalizedTerm}`.trim(),
      `${normalizedTerm} software`.trim(),
      `software quality ${normalizedTerm}`.trim(),
      `quality ${normalizedTerm}`.trim()
    ].filter(Boolean);

    for (const [alias, expansions] of Object.entries(this.queryAliases)) {
      if (normalizedTerm.includes(alias)) {
        queries.push(...expansions);
      }
    }

    return Array.from(new Set(queries));
  }

  _isDomainQuery(searchPhrases) {
    return searchPhrases.some(phrase => this.softwareQualityKeywords.includes(phrase));
  }

  _matchesSoftwareQualityContext(result, searchPhrases) {
    const searchableParts = [
      result.label,
      result.description,
      result.abstract,
      result.uri,
      ...(Array.isArray(result.categories) ? result.categories.map(category => category.label) : [])
    ];

    const searchableText = this._normalizeText(searchableParts.join(' '));
    const normalizedPhrases = searchPhrases.map(phrase => this._normalizeText(phrase)).filter(Boolean);

    const matchesQuery = normalizedPhrases.some(phrase => searchableText.includes(phrase));
    const matchesDomain = this.softwareQualityKeywords.some(keyword => searchableText.includes(keyword));

    return matchesDomain && (matchesQuery || this._isDomainQuery(normalizedPhrases));
  }

  _scoreResult(result, searchPhrases) {
    const searchableParts = [
      result.label,
      result.description,
      result.abstract,
      result.uri,
      ...(Array.isArray(result.categories) ? result.categories.map(category => category.label) : [])
    ];

    const searchableText = this._normalizeText(searchableParts.join(' '));
    const normalizedPhrases = searchPhrases.map(phrase => this._normalizeText(phrase)).filter(Boolean);

    let score = 0;

    for (const phrase of normalizedPhrases) {
      if (searchableText.includes(phrase)) {
        score += phrase.length > 10 ? 3 : 2;
      }
    }

    if (result.refcount) {
      score += Math.min(Math.floor(Number(result.refcount) / 50), 5);
    }

    if (result.label && normalizedPhrases.includes(this._normalizeText(result.label))) {
      score += 5;
    }

    return score;
  }

  async _lookup(term) {
    const response = await axios.get(this._lookupEndpoint(), {
      params: {
        QueryString: term,
        MaxHits: 10
      },
      headers: {
        Accept: 'application/xml'
      }
    });

    const xml = typeof response.data === 'string' ? response.data : String(response.data || '');
    return this._parseLookupResults(xml);
  }

  async searchConcepts(term, lang = 'es') {
    if (!term || typeof term !== 'string' || !term.trim()) {
      return [];
    }

    const searchPhrases = this._buildLookupQueries(term);
    const resultsByUri = new Map();

    try {
      for (const lookupQuery of searchPhrases) {
        const results = await this._lookup(lookupQuery);

        for (const result of results) {
          if (!result.uri || resultsByUri.has(result.uri)) {
            continue;
          }

          if (!this._matchesSoftwareQualityContext(result, searchPhrases)) {
            continue;
          }

          const categories = (result.categories || [])
            .map(category => category.label)
            .filter(Boolean);

          resultsByUri.set(result.uri, {
            ...result,
            categories,
            typeName: categories[0] || '',
            propertyEntries: categories.length
              ? [{ key: 'category', values: categories.join(', ') }]
              : []
          });
        }

        if (resultsByUri.size >= 20) {
          break;
        }
      }

      return Array.from(resultsByUri.values())
        .sort((left, right) => this._scoreResult(right, searchPhrases) - this._scoreResult(left, searchPhrases))
        .slice(0, 20);
    } catch (error) {
      this._handleError(error);
      return [];
    }
  }

  async getConceptDetails(uri, lang = 'es') {
    if (!uri) {
      return null;
    }

    const resourceName = this._resourceNameFromUri(uri);

    try {
      const response = await axios.get(`https://dbpedia.org/data/${encodeURIComponent(resourceName)}.json`, {
        timeout: dbpediaConfig.defaultQueryOptions.timeout
      });

      const entity = response.data?.[uri] || response.data?.[`http://dbpedia.org/resource/${resourceName}`];

      if (!entity) {
        return null;
      }

      const label = this._getTextValue(entity['http://www.w3.org/2000/01/rdf-schema#label'], lang) || resourceName.replace(/_/g, ' ');
      const abstract = this._getTextValue(entity['http://dbpedia.org/ontology/abstract'], lang) || this._getTextValue(entity['http://dbpedia.org/ontology/description'], lang);
      const thumbnail = this._getTextValue(entity['http://dbpedia.org/ontology/thumbnail']) || this._getTextValue(entity['http://xmlns.com/foaf/0.1/depiction']);
      const types = (entity['http://www.w3.org/1999/02/22-rdf-syntax-ns#type'] || [])
        .map(item => item?.value)
        .filter(Boolean)
        .filter(value => value.includes('dbpedia.org/ontology/'))
        .map(value => value.split('/').pop().replace(/_/g, ' '));
      const categories = (entity['http://purl.org/dc/terms/subject'] || [])
        .map(item => item?.value)
        .filter(Boolean)
        .map(value => value.split('/').pop().replace(/_/g, ' '));

      const propertyEntries = [];

      if (types.length) {
        propertyEntries.push({ key: 'type', values: Array.from(new Set(types)).join(', ') });
      }

      if (categories.length) {
        propertyEntries.push({ key: 'category', values: Array.from(new Set(categories)).join(', ') });
      }

      return {
        uri,
        label,
        abstract,
        description: abstract,
        thumbnail,
        types: Array.from(new Set(types)),
        categories: Array.from(new Set(categories)),
        propertyEntries,
        dbpediaPage: uri
      };
    } catch (error) {
      this._handleError(error);
      return null;
    }
  }

  async searchDiseases(term, lang = 'es') {
    return this.searchConcepts(term, lang);
  }

  async getDiseaseDetails(uri, lang = 'es') {
    return this.getConceptDetails(uri, lang);
  }

  _getTextValue(values, preferredLang = 'en') {
    if (!Array.isArray(values) || values.length === 0) {
      return '';
    }

    const preferred = values.find(item => item.lang === preferredLang);
    if (preferred?.value) {
      return preferred.value;
    }

    const english = values.find(item => item.lang === 'en');
    if (english?.value) {
      return english.value;
    }

    return values.find(item => item.value)?.value || '';
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
