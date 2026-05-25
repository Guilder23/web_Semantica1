const { translate } = require('@vitalets/google-translate-api');

class TranslationService {
  constructor() {
    this.cache = new Map();
    this.localDictionary = {
      en: {
        'abierto': 'Open',
        'cerrado': 'Closed',
        'activo': 'Active',
        'ejecutado': 'Executed',
        'pendiente': 'Pending',
        'alta': 'High',
        'media': 'Medium',
        'baja': 'Low',
        'alto': 'High',
        'medio': 'Medium',
        'bajo': 'Low',
        'defecto': 'Defect',
        'requerimiento': 'Requirement',
        'prueba': 'Test',
        'herramienta': 'Tool',
        'componente de software': 'Software Component',
        'componente software': 'Software Component',
        'entorno de prueba': 'Test Environment',
        'proceso de desarrollo': 'Development Process',
        'métrica de calidad': 'Quality Metric',
        'metrica de calidad': 'Quality Metric',
        'fase de testing': 'Testing phase',
        'verifica inicio de sesión': 'Verifies login',
        'login del sistema': 'System login',
        'registro de usuario': 'User registration',
        'recuperar contraseña': 'Password recovery',
        'logout del sistema': 'System logout',
        'cambio de contraseña': 'Password change',
        'perfil de usuario': 'User profile',
        'módulo login': 'Login Module',
        'modulo login': 'Login Module',
        'error en login': 'Login error',
        'cobertura': 'Coverage',
        'java': 'Java',
        'testing': 'Testing'
      },
      pt: {
        'abierto': 'Aberto',
        'cerrado': 'Fechado',
        'activo': 'Ativo',
        'ejecutado': 'Executado',
        'pendiente': 'Pendente',
        'alta': 'Alta',
        'media': 'Média',
        'baja': 'Baixa',
        'alto': 'Alto',
        'medio': 'Médio',
        'bajo': 'Baixo',
        'defecto': 'Defeito',
        'requerimiento': 'Requisito',
        'prueba': 'Teste',
        'herramienta': 'Ferramenta',
        'componente software': 'Componente de software',
        'entorno de prueba': 'Ambiente de teste',
        'proceso de desarrollo': 'Processo de desenvolvimento',
        'métrica de calidad': 'Métrica de qualidade',
        'error en login': 'Erro no login'
      },
      de: {
        'abierto': 'Offen',
        'cerrado': 'Geschlossen',
        'activo': 'Aktiv',
        'ejecutado': 'Ausgeführt',
        'pendiente': 'Ausstehend',
        'alta': 'Hoch',
        'media': 'Mittel',
        'baja': 'Niedrig',
        'defecto': 'Fehler',
        'requerimiento': 'Anforderung',
        'prueba': 'Test',
        'herramienta': 'Werkzeug',
        'componente software': 'Softwarekomponente',
        'entorno de prueba': 'Testumgebung',
        'proceso de desarrollo': 'Entwicklungsprozess',
        'métrica de calidad': 'Qualitätsmetrik',
        'error en login': 'Login-Fehler'
      },
      fr: {
        'abierto': 'Ouvert',
        'cerrado': 'Fermé',
        'activo': 'Actif',
        'ejecutado': 'Exécuté',
        'pendiente': 'En attente',
        'alta': 'Élevée',
        'media': 'Moyenne',
        'baja': 'Faible',
        'alto': 'Élevé',
        'medio': 'Moyen',
        'bajo': 'Faible',
        'defecto': 'Défaut',
        'requerimiento': 'Exigence',
        'prueba': 'Test',
        'herramienta': 'Outil',
        'componente software': 'Composant logiciel',
        'entorno de prueba': 'Environnement de test',
        'proceso de desarrollo': 'Processus de développement',
        'métrica de calidad': 'Métrique de qualité',
        'error en login': 'Erreur de connexion'
      }
    };
  }

  _localTranslate(text, targetLang) {
    if (typeof text !== 'string') return null;

    const normalized = text.trim().toLowerCase();
    const dictionary = this.localDictionary[targetLang];

    if (!dictionary) return null;

    if (dictionary[normalized]) {
      return dictionary[normalized];
    }

    return null;
  }

  async translateText(text, targetLang, sourceLang = 'auto') {
    const localTranslation = this._localTranslate(text, targetLang);
    if (localTranslation) {
      return localTranslation;
    }

    const cacheKey = `${sourceLang}:${targetLang}:${text}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const result = await translate(text, { 
        to: targetLang,
        from: sourceLang 
      });
      this.cache.set(cacheKey, result.text);
      return result.text;
    } catch (error) {
      console.error('Translation error:', error);
      this.cache.set(cacheKey, text);
      return text;
    }
  }

  _shouldTranslate(value) {
    if (typeof value !== 'string') return false;

    const text = value.trim();
    if (!text) return false;
    if (/^https?:\/\//i.test(text)) return false;
    if (/^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return false;
    if (/^[A-Z0-9_-]{2,}$/.test(text) && !/[a-záéíóúñ]/i.test(text)) return false;
    if (/^\d+(?:[.,]\d+)?$/.test(text)) return false;

    return true;
  }

  async _translateValue(value, targetLang) {
    if (Array.isArray(value)) {
      const translatedItems = await Promise.all(
        value.map(item => this._translateValue(item, targetLang))
      );
      return translatedItems;
    }

    if (!this._shouldTranslate(value)) {
      return value;
    }

    return this.translateText(value, targetLang);
  }

  async _translateBatch(values, targetLang) {
    const separator = '\n__COPILOT_TRANSLATION_SEPARATOR_7d9d1f__\n';
    const payload = values.join(separator);
    const translatedPayload = await this.translateText(payload, targetLang);
    const translatedValues = translatedPayload.split(separator);

    if (translatedValues.length !== values.length) {
      return Promise.all(values.map(value => this._translateValue(value, targetLang)));
    }

    return translatedValues;
  }

  async translateResults(results, targetLang) {
    if (targetLang === 'es') return results;
    
    const translated = { ...results };
    const fieldsToTranslate = [
      'label',
      'abstract',
      'descripcion',
      'tipo',
      'estado',
      'prioridad',
      'severidad',
      'lenguaje',
      'nombreEntorno',
      'nombreMetrica'
    ];

    const batchFields = [];
    
    for (const field of fieldsToTranslate) {
      if (translated[field] === undefined || translated[field] === null) {
        continue;
      }

      const localTranslation = this._localTranslate(translated[field], targetLang);
      if (localTranslation) {
        translated[field] = localTranslation;
        continue;
      }

      if (this._shouldTranslate(translated[field])) {
        batchFields.push(field);
      }
    }

    if (batchFields.length > 0) {
      const translatedValues = await this._translateBatch(
        batchFields.map(field => translated[field]),
        targetLang
      );

      batchFields.forEach((field, index) => {
        translated[field] = translatedValues[index];
      });
    }
    
    return translated;
  }
}

module.exports = new TranslationService();