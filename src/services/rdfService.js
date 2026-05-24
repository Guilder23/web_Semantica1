const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Parser, Store, DataFactory } = require('n3');

const { namedNode } = DataFactory;

const rdfFilePath = path.join(__dirname, '../public/data/OntologiaCalidadSoftware.ttl');
const rdfFileUrl = pathToFileURL(rdfFilePath).href;
const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label');
const RDFS_COMMENT = namedNode('http://www.w3.org/2000/01/rdf-schema#comment');
const RDFS_SUBCLASS = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const OWL_CLASS = namedNode('http://www.w3.org/2002/07/owl#Class');

class RDFService {
  constructor() {
    this.storePromise = this._loadStore();
    this.conceptMapPromise = null;
  }

  _localName(value) {
    if (!value) {
      return '';
    }

    return value.split(/[#/]/).pop().replace(/_/g, ' ');
  }

  _humanizeLocalName(value) {
    const localName = this._localName(value);

    if (!localName) {
      return '';
    }

    return localName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  }

  _literalValue(term) {
    if (!term) {
      return '';
    }

    return term.termType === 'NamedNode' ? this._localName(term.value) : term.value;
  }

  async _loadStore() {
    const parser = new Parser({ baseIRI: rdfFileUrl });
    const turtleContent = fs.readFileSync(rdfFilePath, 'utf8');
    const quads = parser.parse(turtleContent);
    return new Store(quads);
  }

  _buildConceptIndex(store) {
    const concepts = new Map();

    for (const quad of store.getQuads(null, null, null, null)) {
      const subject = quad.subject.value;

      if (!concepts.has(subject)) {
        concepts.set(subject, {
          uri: subject,
          label: '',
          description: '',
          types: [],
          parents: [],
          properties: {},
          isConcept: false
        });
      }

      const record = concepts.get(subject);
      const predicateName = this._localName(quad.predicate.value);
      const objectValue = this._literalValue(quad.object);

      if (predicateName === 'type' && quad.object.termType === 'NamedNode' && quad.object.value === OWL_CLASS.value) {
        record.isConcept = true;
      }

      if (predicateName === 'label') {
        record.label = objectValue;
        continue;
      }

      if (predicateName === 'comment') {
        record.description = objectValue;
        continue;
      }

      if (predicateName === 'type') {
        const typeName = this._localName(quad.object.value);
        if (typeName && !record.types.includes(typeName)) {
          record.types.push(typeName);
        }
        continue;
      }

      if (predicateName === 'subClassOf') {
        const parentName = this._localName(quad.object.value);
        if (parentName && !record.parents.includes(parentName)) {
          record.parents.push(parentName);
        }
        continue;
      }

      if (!record.properties[predicateName]) {
        record.properties[predicateName] = [];
      }

      if (!record.properties[predicateName].includes(objectValue)) {
        record.properties[predicateName].push(objectValue);
      }
    }

    return concepts;
  }

  async _getConceptIndex() {
    if (!this.conceptMapPromise) {
      this.conceptMapPromise = this.storePromise.then(store => this._buildConceptIndex(store));
    }

    return this.conceptMapPromise;
  }

  async searchConcepts(term) {
    if (!term || typeof term !== 'string' || !term.trim()) {
      return [];
    }

    const concepts = await this._getConceptIndex();
    const searchTerm = term.trim().toLowerCase();

    const results = [];

    for (const record of concepts.values()) {
      if (!record.isConcept) {
        continue;
      }

      const label = record.label || this._humanizeLocalName(record.uri);
      const description = record.description || '';
      const haystack = `${label} ${description}`.toLowerCase();

      if (haystack.includes(searchTerm)) {
        results.push({
          uri: record.uri,
          label,
          description
        });
      }
    }

    return results.sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }

  async getConceptDetails(uri) {
    const concepts = await this._getConceptIndex();
    const record = concepts.get(uri);

    if (!record) {
      return null;
    }

    const details = {
      uri,
      label: record.label || this._humanizeLocalName(uri),
      description: record.description || '',
      types: [...record.types],
      parents: [...record.parents],
      properties: { ...record.properties },
      propertyEntries: Object.entries(record.properties).map(([key, values]) => ({
        key,
        values: values.join(', ')
      }))
    };

    return details;
  }
}

module.exports = new RDFService();