const axios = require('axios');
const fusekiConfig = require('../config/fuseki');

const QUALITY_SOFTWARE_NS = 'http://www.semanticweb.org/user/ontologies/2026/2/calidad_software.owl#';

class RDFService {
  _getEndpoint() {
    return fusekiConfig.endpoint;
  }

  async _runQuery(query) {
    const response = await axios.get(this._getEndpoint(), {
      params: {
        ...fusekiConfig.defaultQueryOptions,
        query
      },
      headers: {
        Accept: 'application/sparql-results+json'
      }
    });

    const rows = response.data?.results?.bindings;
    if (!Array.isArray(rows)) {
      throw new Error('Invalid response structure from Fuseki');
    }

    return rows;
  }

  _value(binding, key) {
    return binding?.[key]?.value;
  }

  _getLocalName(value) {
    if (!value) return '';
    const text = String(value);
    return text.includes('#') ? text.split('#').pop() : text.split('/').pop();
  }

  async searchDiseases(term, lang = 'es') {
    const escapedTerm = String(term || '').replace(/"/g, '\\"').toLowerCase();

    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX qs: <${QUALITY_SOFTWARE_NS}>

      SELECT DISTINCT ?s ?label ?type ?descripcion ?estado ?prioridad ?severidad ?lenguaje ?version ?nombreEntorno ?nombreMetrica ?idDefecto ?idRequerimiento WHERE {
        ?s a ?type .
        VALUES ?type {
          qs:ComponenteSoftware
          qs:Defecto
          qs:Herramienta
          qs:Prueba
          qs:MetricaCalidad
          qs:Requerimiento
          qs:EntornoPrueba
          qs:ProcesoDesarrollo
          qs:Servicio
          qs:Modulo
          qs:API
          qs:BaseDatos
          qs:Error
          qs:Falla
        }

        OPTIONAL { ?s qs:nombre ?nombre }
        OPTIONAL { ?s qs:descripcion ?descripcion }
        OPTIONAL { ?s qs:estado ?estado }
        OPTIONAL { ?s qs:prioridad ?prioridad }
        OPTIONAL { ?s qs:severidad ?severidad }
        OPTIONAL { ?s qs:lenguaje ?lenguaje }
        OPTIONAL { ?s qs:version ?version }
        OPTIONAL { ?s qs:nombreEntorno ?nombreEntorno }
        OPTIONAL { ?s qs:nombreMetrica ?nombreMetrica }
        OPTIONAL { ?s qs:idDefecto ?idDefecto }
        OPTIONAL { ?s qs:idRequerimiento ?idRequerimiento }
        OPTIONAL { ?s rdfs:label ?rdfsLabel }

        BIND(COALESCE(?rdfsLabel, ?nombre, ?nombreEntorno, ?nombreMetrica, ?idDefecto, ?idRequerimiento, REPLACE(STRAFTER(STR(?s), "#"), "_", " ")) AS ?label)

        FILTER(
          CONTAINS(LCASE(STR(?label)), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?descripcion, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?estado, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?prioridad, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?severidad, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?lenguaje, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?version, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?nombreEntorno, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?nombreMetrica, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?idDefecto, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?idRequerimiento, ""))), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(?s)), "${escapedTerm}")
        )
      }
      LIMIT 50
    `;

    const rows = await this._runQuery(query);

    return rows.map(binding => ({
      uri: this._value(binding, 's'),
      label: this._value(binding, 'label')
        || this._value(binding, 'nombre')
        || this._value(binding, 'nombreEntorno')
        || this._value(binding, 'nombreMetrica')
        || this._value(binding, 'idDefecto')
        || this._value(binding, 'idRequerimiento')
        || this._getLocalName(this._value(binding, 'type')),
      tipo: this._getLocalName(this._value(binding, 'type')),
      descripcion: this._value(binding, 'descripcion'),
      estado: this._value(binding, 'estado'),
      prioridad: this._value(binding, 'prioridad'),
      severidad: this._value(binding, 'severidad'),
      lenguaje: this._value(binding, 'lenguaje'),
      version: this._value(binding, 'version'),
      nombreEntorno: this._value(binding, 'nombreEntorno'),
      nombreMetrica: this._value(binding, 'nombreMetrica'),
      idDefecto: this._value(binding, 'idDefecto'),
      idRequerimiento: this._value(binding, 'idRequerimiento')
    }));
  }

  async getDiseaseDetails(uri) {
    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX qs: <${QUALITY_SOFTWARE_NS}>

      SELECT ?p ?o WHERE {
        <${uri}> ?p ?o .
      }
    `;

    const rows = await this._runQuery(query);

    const details = {
      uri,
      label: null,
      tipo: null,
      descripcion: null,
      estado: null,
      prioridad: null,
      severidad: null,
      lenguaje: null,
      version: null,
      nombreEntorno: null,
      nombreMetrica: null,
      idDefecto: null,
      idRequerimiento: null,
      predicates: []
    };

    rows.forEach(binding => {
      const predicate = this._value(binding, 'p');
      const object = this._value(binding, 'o');
      const predicateName = this._getLocalName(predicate);
      const objectName = this._getLocalName(object);

      details.predicates.push({ predicate: predicateName, value: object });

      if (predicateName === 'type') {
        details.tipo = objectName;
        return;
      }

      if (predicateName === 'nombre' && !details.label) details.label = object;
      if (predicateName === 'nombreEntorno' && !details.label) details.label = object;
      if (predicateName === 'nombreMetrica' && !details.label) details.label = object;
      if (predicateName === 'idDefecto' && !details.label) details.label = object;
      if (predicateName === 'idRequerimiento' && !details.label) details.label = object;

      if (Object.prototype.hasOwnProperty.call(details, predicateName)) {
        details[predicateName] = object;
      }
    });

    if (!details.label) {
      details.label = this._getLocalName(uri).replace(/_/g, ' ');
    }

    return details;
  }
}

module.exports = new RDFService();
