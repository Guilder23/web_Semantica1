const dbpediaService = require('../services/dbpediaService');
const translationService = require('../services/translationService');

exports.home = (req, res) => {
  res.render('index', { 
    title: 'Buscador Semántico de Medicina',
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
        results.map(disease => translationService.translateResults(disease, lang))
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
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error en la búsqueda médica',
      error,
      lang: req.lang
    });
  }
};

exports.diseaseDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const lang = req.lang || 'es';
    const disease = await dbpediaService.getDiseaseDetails(decodeURIComponent(uri), lang);
    
    if (!disease) {
      return res.status(404).render('error', {
        title: 'Enfermedad no encontrada',
        message: 'La enfermedad solicitada no fue encontrada',
        lang
      });
    }
    
    if (lang !== 'en') {
      disease = await translationService.translateResults(disease, lang);
    }
    
    res.render('disease-detail', { 
      title: disease.name,
      disease,
      lang
    });
  } catch (error) {
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error al cargar detalles de la enfermedad',
      error,
      lang: req.lang
    });
  }
};