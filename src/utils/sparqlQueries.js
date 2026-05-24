module.exports = {
  searchDiseases: (term, lang = "es") => {
    if (!term || typeof term !== "string") {
      throw new Error("Invalid search term");
    }

    const escapedTerm = term.replace(/"/g, '\\"').toLowerCase();

    return `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbp: <http://dbpedia.org/property/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT DISTINCT ?disease ?label ?abstract ?icd10 ?specialty ?field WHERE {
        
        ?disease a dbo:Disease .

        # Buscar por nombre en cualquier idioma
        ?disease rdfs:label ?labelRaw .
        FILTER (CONTAINS(LCASE(STR(?labelRaw)), "${escapedTerm}"))

        # Preferir el idioma actual, pero aceptar cualquier idioma si no existe
        OPTIONAL { 
          ?disease rdfs:label ?labelLang .
          FILTER (LANG(?labelLang)="${lang}")
        }

        BIND(COALESCE(?labelLang, ?labelRaw) AS ?label)

        OPTIONAL { 
          ?disease dbo:abstract ?abstractRaw .
          FILTER (LANG(?abstractRaw)="${lang}" || LANG(?abstractRaw)="en")
        }

        BIND(?abstractRaw AS ?abstract)

        OPTIONAL { ?disease dbp:icd10 ?icd10 }
        OPTIONAL { ?disease dbo:medicalSpecialty ?specialty }
        OPTIONAL { ?disease dbo:field ?field }
      }
      LIMIT 50
    `;
  }
};
