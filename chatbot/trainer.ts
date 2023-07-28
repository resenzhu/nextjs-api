const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

dockStart({
  use: ['Basic', 'LangEn', 'LangId'],
  settings: {
    nlp: {
      forceNER: true,
      languages: ['en', 'id'],
      corpora: ['chatbot/corpus-en.json', 'chatbot/corpus-id.json']
    }
  }
}).then((dock) => {
  const nlp = dock.get('nlp');
  nlp.train().then(() => {
    nlp.save('chatbot/model.nlp');
  });
});
