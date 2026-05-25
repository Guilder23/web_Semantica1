const fs = require('fs');
const path = require('path');
const { QueryEngine } = require('@comunica/query-sparql');
const { pathToFileURL } = require('url');
const _rdfExt = require('rdf-ext');
const rdf = _rdfExt.default || _rdfExt;
const { RdfXmlParser } = require('rdfxml-streaming-parser');

const rdfFilePath = path.join(__dirname, '../public/data/calidadSoftware.rdf');
const rdfFileUrl = pathToFileURL(rdfFilePath).href;
const QUALITY_SOFTWARE_NS = 'http://www.semanticweb.org/user/ontologies/2026/2/calidad_software.owl#';

class RDFService {
  constructor() {
    this.engine = new QueryEngine();
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

    const source = await this._getRdfjsSource();
    const result = await this.engine.query(query, {
      sources: [source]
    });

    let bindings;
    if (typeof result.bindings === 'function') {
      bindings = await result.bindings();
    } else if (typeof result.execute === 'function') {
      bindings = [];
      const stream = await result.execute();
      for await (const b of stream) bindings.push(b);
    } else {
      throw new Error('Unsupported query result type from Comunica');
    }

    return bindings.map(binding => ({
      uri: binding.get('s')?.value,
      label: binding.get('label')?.value
        || binding.get('nombre')?.value
        || binding.get('nombreEntorno')?.value
        || binding.get('nombreMetrica')?.value
        || binding.get('idDefecto')?.value
        || binding.get('idRequerimiento')?.value
        || binding.get('type')?.value?.split('#').pop(),
      tipo: binding.get('type')?.value?.split('#').pop(),
      descripcion: binding.get('descripcion')?.value,
      estado: binding.get('estado')?.value,
      prioridad: binding.get('prioridad')?.value,
      severidad: binding.get('severidad')?.value,
      lenguaje: binding.get('lenguaje')?.value,
      version: binding.get('version')?.value,
      nombreEntorno: binding.get('nombreEntorno')?.value,
      nombreMetrica: binding.get('nombreMetrica')?.value,
      idDefecto: binding.get('idDefecto')?.value,
      idRequerimiento: binding.get('idRequerimiento')?.value
    }));
  }

  async getDiseaseDetails(uri) {
    const query = `
      PREFIX qs: <${QUALITY_SOFTWARE_NS}>
      SELECT ?p ?o WHERE {
        <${uri}> ?p ?o .
      }
    `;
    const source = await this._getRdfjsSource();
    const result = await this.engine.query(query, {
      sources: [source]
    });

    let bindings;
    if (typeof result.bindings === 'function') {
      bindings = await result.bindings();
    } else if (typeof result.execute === 'function') {
      bindings = [];
      const stream = await result.execute();
      for await (const b of stream) bindings.push(b);
    } else {
      throw new Error('Unsupported query result type from Comunica');
    }

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

    const getLocalName = (value) => {
      if (!value) return '';
      const text = String(value);
      return text.includes('#') ? text.split('#').pop() : text.split('/').pop();
    };

    bindings.forEach(binding => {
      const predicate = binding.get('p')?.value;
      const object = binding.get('o')?.value;
      const predicateName = getLocalName(predicate);
      const objectName = getLocalName(object);

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
      details.label = getLocalName(uri).replace(/_/g, ' ');
    }

    return details;
  }

  async _getRdfjsSource() {
    if (this._rdfSource) return this._rdfSource;

    const parser = new RdfXmlParser({ baseIRI: rdfFileUrl });
    const input = fs.createReadStream(rdfFilePath);
    const quadStream = input.pipe(parser);

    const dataset = rdf.dataset();
    for await (const quad of quadStream) {
      dataset.add(quad);
    }

    // Comunica espera el tipo 'rdfjs' para fuentes RDF/JS
    this._rdfSource = { type: 'rdfjs', value: dataset };
    return this._rdfSource;
  }
}

module.exports = new RDFService();