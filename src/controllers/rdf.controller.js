const rdfService = require('../services/rdfService');

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const results = await rdfService.searchDiseases(q);
    res.render('search-results', {
      title: `Resultados de calidad de software para "${q}"`,
      query: q,
      diseases: results,
      isEmpty: results.length === 0
    });
  } catch (err) {
    console.error('RDF controller error:', err);
    res.status(500).render('error', {
      title: 'Error',
      message: 'La búsqueda RDF de calidad de software falló',
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
      title: disease.label || 'Detalles de Calidad de Software',
      disease
    });
  } catch (err) {
    console.error('RDF controller details error:', err);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load quality software details',
      error: err
    });
  }
};
