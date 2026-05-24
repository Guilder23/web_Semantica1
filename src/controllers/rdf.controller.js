const rdfService = require('../services/rdfService');

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const queryText = typeof q === 'string' ? q.trim() : '';
    const results = queryText ? await rdfService.searchConcepts(queryText) : [];
    res.render('search-results', {
      title: queryText ? `Resultados para "${queryText}"` : 'Buscador RDF de Calidad de Software',
      query: queryText,
      concepts: results,
      diseases: results,
      isEmpty: results.length === 0
    });
  } catch (err) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'La búsqueda RDF de calidad de software falló',
      error: err
    });
  }
};

exports.conceptDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const decodedUri = decodeURIComponent(uri);
    const concept = await rdfService.getConceptDetails(decodedUri);
    if (!concept) {
      return res.status(404).render('error', {
        title: 'Concepto no encontrado',
        message: 'El concepto solicitado no fue encontrado'
      });
    }
    res.render('disease-detail', {
      title: concept.label || 'Detalles del concepto',
      concept
    });
  } catch (err) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'No se pudieron cargar los detalles del concepto',
      error: err
    });
  }
};

exports.diseaseDetails = exports.conceptDetails;
