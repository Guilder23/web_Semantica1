module.exports = {
  searchSoftware: (term, lang = "es") => {
    if (!term || typeof term !== "string") {
      throw new Error("Invalid search term");
    }

    const escapedTerm = term.replace(/"/g, '\\"').toLowerCase();

    return `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbp: <http://dbpedia.org/property/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT DISTINCT ?entity ?label ?abstract ?developer ?programmingLanguage ?latestReleaseVersion ?license ?thumbnail WHERE {
        ?entity a ?type .
        VALUES ?type { dbo:Software dbo:ProgrammingLanguage dbo:Algorithm }

        # Buscar por nombre en cualquier idioma
        ?entity rdfs:label ?labelRaw .
        FILTER (CONTAINS(LCASE(STR(?labelRaw)), "${escapedTerm}"))

        # Preferir el idioma actual, pero aceptar cualquier idioma si no existe
        OPTIONAL { 
          ?entity rdfs:label ?labelLang .
          FILTER (LANG(?labelLang)="${lang}")
        }

        BIND(COALESCE(?labelLang, ?labelRaw) AS ?label)

        OPTIONAL { 
          ?entity dbo:abstract ?abstractRaw .
          FILTER (LANG(?abstractRaw)="${lang}" || LANG(?abstractRaw)="en")
        }

        BIND(?abstractRaw AS ?abstract)

        OPTIONAL { ?entity dbo:developer ?developer }
        OPTIONAL { ?entity dbp:programmingLanguage ?programmingLanguage }
        OPTIONAL { ?entity dbo:latestReleaseVersion ?latestReleaseVersion }
        OPTIONAL { ?entity dbo:license ?license }
        OPTIONAL { ?entity dbo:thumbnail ?thumbnail }
      }
      LIMIT 50
    `;
  }
};
