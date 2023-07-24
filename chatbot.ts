'use strict';

const {dockStart} = require('@nlpjs/basic');

dockStart().then((dock) => {
  const nlp = dock.get('nlp');
  nlp.train().then(() => {
    nlp.save('chatbot.nlp');
  });
});
