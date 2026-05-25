
const express = require('express');
const router = express.Router();
const rdfController = require('../controllers/rdf.controller');

// Ruta principal (home)
router.get('/', (req, res) => {
  res.render('index', { 
    title: 'Buscador RDF de Calidad de Software' 
  });
});

// Ruta para búsqueda de calidad de software desde RDF
router.get('/search', rdfController.search);

// Ruta para mostrar detalles de un recurso RDF
router.get('/disease/:uri', rdfController.diseaseDetails);

module.exports = router;
