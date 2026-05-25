module.exports = {
  searchDiseases: (term, lang = "es") => {
    if (!term || typeof term !== "string") {
      throw new Error("Invalid search term");
    }

    const escapedTerm = term.replace(/"/g, '\\"').toLowerCase();
    const softwareQualityTerms = [
      'software quality',
      'quality assurance',
      'software testing',
      'software metrics',
      'code quality',
      'maintainability',
      'reliability',
      'usability',
      'software engineering',
      'verification and validation',
      'static analysis',
      'code review'
    ];

    const topicFilters = softwareQualityTerms
      .map(topic => `CONTAINS(LCASE(STR(?labelRaw)), "${topic}") || CONTAINS(LCASE(STR(COALESCE(?abstractRaw, \"\"))), "${topic}")`)
      .join(' || ');

    return `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbp: <http://dbpedia.org/property/>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT DISTINCT ?resource ?label ?abstract ?type ?thumbnail WHERE {
        ?resource rdfs:label ?labelRaw .
        FILTER (LANG(?labelRaw) = "${lang}" || LANG(?labelRaw) = "en" || LANG(?labelRaw) = "")

        OPTIONAL {
          ?resource dbo:abstract ?abstractRaw .
          FILTER (LANG(?abstractRaw) = "${lang}" || LANG(?abstractRaw) = "en")
        }

        OPTIONAL { ?resource rdf:type ?type }
        OPTIONAL { ?resource dbo:thumbnail ?thumbnail }

        BIND(?labelRaw AS ?label)
        BIND(COALESCE(?abstractRaw, "") AS ?abstract)

        FILTER (
          CONTAINS(LCASE(STR(?labelRaw)), "${escapedTerm}") ||
          CONTAINS(LCASE(STR(COALESCE(?abstractRaw, \"\"))), "${escapedTerm}") ||
          ${topicFilters}
        )
      }
      LIMIT 50
    `;
  }
};
