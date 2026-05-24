const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const dbpediaConfig = require('../config/dbpedia');
const { searchDiseases } = require('../utils/sparqlQueries');

class DBpediaService {
  _getEndpoint() {
    return dbpediaConfig.endpoint;
  }

  async searchDiseases(term, lang = 'es') {
    const endpoint = this._getEndpoint();
    const query = searchDiseases(term, lang);

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
        uri: result.disease?.value,
        name: result.label?.value,
        description: result.abstract?.value,
        icd10: result.icd10?.value,
        specialty: result.specialty?.value,
        field: result.field?.value
      }));

      return results;
    } catch (error) {
      this._handleError(error);
      return [];
    }
  }

  async getDiseaseDetails(uri, lang = 'es') {
    const endpoint = this._getEndpoint();

    const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbp: <http://dbpedia.org/property/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT DISTINCT ?label ?abstract ?icd10 ?specialty ?field ?symptom ?treatment ?cause ?riskFactor WHERE {
        BIND(<${uri}> AS ?disease)
        ?disease rdfs:label ?label .
        FILTER(LANG(?label) = "${lang}")

        OPTIONAL { ?disease dbo:abstract ?abstract . FILTER(LANG(?abstract)="${lang}") }
        OPTIONAL { ?disease dbp:icd10 ?icd10 }
        OPTIONAL { ?disease dbo:medicalSpecialty ?specialty }
        OPTIONAL { ?disease dbo:field ?field }
        OPTIONAL { ?disease dbo:symptom ?symptom }
        OPTIONAL { ?disease dbo:treatment ?treatment }
        OPTIONAL { ?disease dbp:causes ?cause }
        OPTIONAL { ?disease dbp:risk ?riskFactor }
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
        name: base.label?.value,
        description: base.abstract?.value,
        icd10: base.icd10?.value,
        specialty: base.specialty?.value,
        field: base.field?.value,
        symptoms: collectUnique('symptom'),
        treatments: collectUnique('treatment'),
        causes: collectUnique('cause'),
        riskFactors: collectUnique('riskFactor')
      };
    } catch (error) {
      this._handleError(error);
      return null;
    }
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

