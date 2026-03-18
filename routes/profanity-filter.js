// profanity-filter.js - Filtro de palavras ofensivas sem dependências
const profanityPT = require('./profanity-pt');

class ProfanityFilter {
    constructor() {
        this.words = profanityPT.map(w => w.toLowerCase());
        // Criar regex para detectar palavras inteiras
        this.regex = new RegExp('\\b(' + this.words.join('|') + ')\\b', 'gi');
    }

    /**
     * Verifica se o texto contém palavras ofensivas
     */
    isProfane(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        return this.words.some(word => lowerText.includes(word));
    }

    /**
     * Limpa o texto substituindo palavras ofensivas por *
     */
    clean(text) {
        if (!text) return text;
        return text.replace(this.regex, (match) => '*'.repeat(match.length));
    }

    /**
     * Lista as palavras ofensivas encontradas
     */
    getProfaneWords(text) {
        if (!text) return [];
        const lowerText = text.toLowerCase();
        return this.words.filter(word => lowerText.includes(word));
    }
}

module.exports = new ProfanityFilter();