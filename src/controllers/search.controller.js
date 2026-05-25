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
    
    let results = await dbpediaService.searchConcepts(q, lang);
    
    if (lang !== 'en') {
      results = await Promise.all(
        results.map(concept => translationService.translateResults(concept, lang))
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
    let concept = await dbpediaService.getConceptDetails(decodeURIComponent(uri), lang);
    
    if (!concept) {
      return res.status(404).render('error', {
        title: 'Concepto no encontrado',
        message: 'El concepto solicitado no fue encontrado',
        lang
      });
    }
    
    if (lang !== 'en') {
      concept = await translationService.translateResults(concept, lang);
    }
    
    res.render('disease-detail', { 
      title: concept.name || concept.label,
      disease: concept,
      lang
    });
  } catch (error) {
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error al cargar detalles del concepto',
      error,
      lang: req.lang
    });
  }
};