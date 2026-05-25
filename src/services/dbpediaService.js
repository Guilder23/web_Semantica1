const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const dbpediaConfig = require('../config/dbpedia');
const { searchSoftware } = require('../utils/sparqlQueries');

class DBpediaService {
  _getEndpoint() {
    return dbpediaConfig.endpoint;
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

      return results;
    } catch (error) {
      this._handleError(error);
      return [];
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

      return {
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
    } catch (error) {
      this._handleError(error);
      return null;
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
