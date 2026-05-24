
const express = require('express');
const router = express.Router();
const rdfController = require('../controllers/rdf.controller');

// Ruta principal (home)
router.get('/', (req, res) => {
  res.render('index', { 
    title: 'Buscador RDF de Calidad de Software' 
  });
});

// Ruta para búsqueda de conceptos desde RDF
router.get('/search', rdfController.search);

// Ruta para mostrar detalles de un concepto RDF
router.get('/concept/:uri', rdfController.conceptDetails);
router.get('/disease/:uri', rdfController.conceptDetails);

module.exports = router;
