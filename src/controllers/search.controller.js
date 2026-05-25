const dbpediaService = require('../services/dbpediaService');
const translationService = require('../services/translationService');

exports.home = (req, res) => {
  res.render('index', { 
    title: 'Buscador Semántico de Calidad de Software',
    lang: req.lang || 'es'
  });
};

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const lang = req.lang || 'es';
    
    let results = await dbpediaService.searchDiseases(q, lang);
    
    if (lang !== 'en') {
      results = await Promise.all(
        results.map(item => translationService.translateResults(item, lang))
      );
    }
    
    // Para depuración - ver todos los datos recibidos
    console.log("Full results data:", JSON.stringify(results, null, 2));
    
    res.render('search-results', { 
      title: `Resultados para "${q}"`,
      query: q,
      diseases: results,
      isEmpty: results.length === 0,
      lang,
      showDetails: true // Nueva variable para la vista
    });
  } catch (error) {
    console.error('Search controller error:', error);
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error en la búsqueda de calidad de software',
      error,
      lang: req.lang
    });
  }
};

exports.diseaseDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const lang = req.lang || 'es';
    let disease = await dbpediaService.getDiseaseDetails(decodeURIComponent(uri), lang);
    
    if (!disease) {
      return res.status(404).render('error', {
        title: 'Recurso no encontrado',
        message: 'El recurso solicitado no fue encontrado',
        lang
      });
    }
    
    if (lang !== 'en') {
      disease = await translationService.translateResults(disease, lang);
    }
    
    res.render('disease-detail', { 
      title: disease.label || 'Detalle de Calidad de Software',
      disease,
      lang
    });
  } catch (error) {
    console.error('Search controller details error:', error);
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error al cargar detalles del recurso',
      error,
      lang: req.lang
    });
  }
};