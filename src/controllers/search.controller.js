const rdfService = require('../services/rdfService');

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
    const queryText = typeof q === 'string' ? q.trim() : '';
    const results = queryText ? await rdfService.searchConcepts(queryText) : [];
    
    res.render('search-results', { 
      title: queryText ? `Resultados para "${queryText}"` : 'Buscador de Calidad de Software',
      query: queryText,
      concepts: results,
      diseases: results,
      isEmpty: results.length === 0,
      lang,
      showDetails: true
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

exports.conceptDetails = async (req, res) => {
  try {
    const { uri } = req.params;
    const lang = req.lang || 'es';
    const concept = await rdfService.getConceptDetails(decodeURIComponent(uri));
    
    if (!concept) {
      return res.status(404).render('error', {
        title: 'Concepto no encontrado',
        message: 'El concepto solicitado no fue encontrado',
        lang
      });
    }
    
    res.render('disease-detail', { 
      title: concept.label,
      concept,
      lang
    });
  } catch (error) {
    res.status(500).render('error', { 
      title: 'Error',
      message: 'Error al cargar los detalles del concepto',
      error,
      lang: req.lang
    });
  }
};

exports.diseaseDetails = exports.conceptDetails;