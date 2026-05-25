const rdfService = require('../services/rdfService');
const translationService = require('../services/translationService');

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const lang = req.lang || 'es';
    let results = await rdfService.searchDiseases(q);

    if (lang !== 'en') {
      results = await Promise.all(
        results.map(item => translationService.translateResults(item, lang))
      );
    }

    res.render('search-results', {
      title: `Resultados de calidad de software para "${q}"`,
      query: q,
      diseases: results,
      isEmpty: results.length === 0,
      lang
    });
  } catch (err) {
    console.error('RDF controller error:', err);
    res.status(500).render('error', {
      title: 'Error',
      message: 'La búsqueda RDF de calidad de software falló',
      error: err,
      lang: req.lang
    });
  }
};

exports.diseaseDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const decodedUri = decodeURIComponent(uri);
    const lang = req.lang || 'es';
    let disease = await rdfService.getDiseaseDetails(decodedUri);

    if (lang !== 'en') {
      disease = await translationService.translateResults(disease, lang);
    }

    res.render('disease-detail', {
      title: disease.label || 'Detalles de Calidad de Software',
      disease,
      lang
    });
  } catch (err) {
    console.error('RDF controller details error:', err);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load quality software details',
      error: err,
      lang: req.lang
    });
  }
};
