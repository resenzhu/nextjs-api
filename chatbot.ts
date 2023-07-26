'use strict';

const {dockStart} = require('@nlpjs/basic');

dockStart({
  use: ['Basic'],
  settings: {
    nlp: {
      corpora: ['chatbot.json']
    }
  }
}).then((dock) => {
  const nlp = dock.get('nlp');
  nlp.train().then(() => {
    nlp.save('chatbot.nlp');
  });
});
