const {dockStart} = require('@nlpjs/basic'); // eslint-disable-line

dockStart({
  use: ['Basic', 'LangEn', 'LangId'],
  settings: {
    nlp: {
      corpora: ['chatbot-en.json', 'chatbot-id.json']
    }
  }
}).then((dock) => {
  const nlp = dock.get('nlp');
  nlp.train().then(() => {
    nlp.save('chatbot.nlp');
  });
});
