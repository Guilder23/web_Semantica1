const rdfService = require('../services/rdfService');

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const results = await rdfService.searchDiseases(q);
    res.render('search-results', {
      title: `Resultados para "${q}"`,
      query: q,
      diseases: results,
      isEmpty: results.length === 0
    });
  } catch (err) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'La búsqueda RDF falló',
      error: err
    });
  }
};

exports.diseaseDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const decodedUri = decodeURIComponent(uri);
    const disease = await rdfService.getDiseaseDetails(decodedUri);
    res.render('disease-detail', {
      title: disease['http://www.w3.org/2000/01/rdf-schema#label'] || 'Detalles de la Enfermedad',
      disease
    });
  } catch (err) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load disease details',
      error: err
    });
  }
};
