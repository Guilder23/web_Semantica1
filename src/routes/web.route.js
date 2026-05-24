// routes/web.js
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');

// Home
router.get('/', searchController.home);

// Búsqueda
router.get('/search', searchController.search);

// Detalle de concepto de calidad de software
router.get('/concept/:uri', searchController.conceptDetails);
router.get('/disease/:uri', searchController.conceptDetails);

module.exports = router;