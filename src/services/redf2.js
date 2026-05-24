const express = require('express');
const path = require('path');
const { QueryEngine } = require('@comunica/query-sparql');

const app = express();
const port = 3000;
const queryEngine = new QueryEngine();

app.get('/enfermedades', async (req, res) => {
  try {
    // Ruta absoluta del archivo TTL
    const filePath = path.resolve(__dirname, '../public/data/OntologiaMedicina.ttl');
    // Convertir a URL tipo file://
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;

    const query = `
      PREFIX untitled: <http://www.semanticweb.org/adric/ontologies/2025/4/untitled-ontology-17#>
      SELECT ?enfermedad ?nombre ?anio WHERE {
        ?enfermedad a untitled:enfermedad ;
               untitled:nombre ?nombre ;
               untitled:anio_publicacion ?anio .
      }
    `;

    const bindingsStream = await queryEngine.queryBindings(query, {
      sources: [fileUrl]
    });

    const enfermedades = [];

    bindingsStream.on('data', (binding) => {
      enfermedades.push({
        uri: binding.get('enfermedad').value,
        nombre: binding.get('nombre').value,
        anio: binding.get('anio')?.value || 'Desconocido'
      });
    });

    bindingsStream.on('end', () => res.json(enfermedades));

    bindingsStream.on('error', (err) => {
      console.error('Error en el stream:', err);
      res.status(500).send('Error al procesar los resultados');
    });

  } catch (error) {
    console.error("Error general:", error);
    res.status(500).send("Error: " + error.message);
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${port}`);
});
