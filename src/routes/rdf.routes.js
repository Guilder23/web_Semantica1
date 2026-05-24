
const express = require('express');
const router = express.Router();
const rdfController = require('../controllers/rdf.controller');

// Ruta principal (home)
router.get('/', (req, res) => {
  res.render('index', { 
    title: 'Buscador RDF de Medicina' 
  });
});

// Ruta para búsqueda de enfermedades desde RDF
router.get('/search', rdfController.search);

// Ruta para mostrar detalles de una enfermedad RDF
router.get('/disease/:uri', rdfController.diseaseDetails);

module.exports = router;
