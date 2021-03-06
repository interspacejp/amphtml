/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {AmpAnimation} from '../amp-animation';
import {WebAnimationPlayState} from '../web-animation-types';
import {WebAnimationRunner} from '../web-animations';
import {toggleExperiment} from '../../../../src/experiments';


describes.sandboxed('AmpAnimation', {}, () => {

  beforeEach(() => {
    toggleExperiment(window, 'amp-animation', true);
  });

  afterEach(() => {
    toggleExperiment(window, 'amp-animation', false);
  });

  function createAnimInWindow(win, attrs, config) {
    const element = win.document.createElement('amp-animation');
    element.setAttribute('id', 'anim1');
    element.setAttribute('layout', 'nodisplay');
    for (const k in attrs) {
      element.setAttribute(k, attrs[k]);
    }

    if (config) {
      const configElement = win.document.createElement('script');
      configElement.setAttribute('type', 'application/json');
      if (typeof config == 'string') {
        configElement.textContent = config;
      } else {
        configElement.textContent = JSON.stringify(config);
      }
      element.appendChild(configElement);
    }

    win.document.body.appendChild(element);
    element.build();
    return element.implementation_;
  }


  describes.realWin('in top-level doc', {
    amp: {
      ampdoc: 'single',
      extensions: ['amp-animation'],
    },
  }, env => {
    let win;
    let viewer;
    let runner;
    let runnerMock;

    beforeEach(() => {
      win = env.win;
      viewer = win.services.viewer.obj;
      viewer.setVisibilityState_('hidden');
      runner = new WebAnimationRunner([]);
      runnerMock = sandbox.mock(runner);
      sandbox.stub(AmpAnimation.prototype, 'createRunner_',
          () => Promise.resolve(runner));
    });

    afterEach(() => {
      runnerMock.verify();
    });

    function createAnim(attrs, config) {
      return createAnimInWindow(win, attrs, config);
    }

    it('should load and parse config', () => {
      const anim = createAnim({}, {duration: 1001});
      expect(anim.configJson_).to.deep.equal({duration: 1001});
    });

    it('should fail without config', () => {
      expect(() => {
        createAnim({}, null);
      }).to.throw(/\"<script type=application\/json>\" must be present/);
    });

    it('should fail with malformed config', () => {
      expect(() => {
        createAnim({}, 'broken');
      }).to.throw(/failed to parse animation script/);
    });

    it('should default trigger to none', () => {
      const anim = createAnim({}, {duration: 1001});
      expect(anim.triggerOnVisibility_).to.be.false;
    });

    it('should parse visibility trigger', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      expect(anim.triggerOnVisibility_).to.be.true;

      // Animation is made to be always in viewport.
      expect(anim.element.style['visibility']).to.equal('hidden');
      expect(anim.element.style['width']).to.equal('1px');
      expect(anim.element.style['height']).to.equal('1px');
      expect(anim.element.style['display']).to.equal('block');
      expect(anim.element.style['position']).to.equal('fixed');
    });

    it('should fail on invalid trigger', () => {
      expect(() => {
        createAnim({trigger: 'unknown'}, {duration: 1001});
      }).to.throw(/Only allowed value for \"trigger\" is \"visibility\"/);
    });

    it('should update visibility from viewer', () => {
      const anim = createAnim({}, {duration: 1001});
      expect(anim.visible_).to.be.false;

      viewer.setVisibilityState_('visible');
      expect(anim.visible_).to.be.true;
    });

    it('should update visibility when paused', () => {
      const anim = createAnim({}, {duration: 1001});
      viewer.setVisibilityState_('visible');
      expect(anim.visible_).to.be.true;

      anim.pauseCallback();
      expect(anim.visible_).to.be.false;
    });

    it('should not activate w/o visibility trigger', () => {
      const anim = createAnim({}, {duration: 1001});
      const activateStub = sandbox.stub(anim, 'activate');
      viewer.setVisibilityState_('visible');
      return anim.layoutCallback().then(() => {
        expect(activateStub).to.not.be.called;
      });
    });

    it('should activate with visibility trigger', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      const activateStub = sandbox.stub(anim, 'activate');
      viewer.setVisibilityState_('visible');
      return anim.layoutCallback().then(() => {
        expect(activateStub).to.be.calledOnce;
      });
    });

    it('should trigger animation, but not start when invisible', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      const startStub = sandbox.stub(anim, 'startOrResume_');
      anim.activate();
      expect(anim.triggered_).to.be.true;
      expect(startStub).to.not.be.called;
    });

    it('should trigger animation and start when visible', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      const startStub = sandbox.stub(anim, 'startOrResume_');
      viewer.setVisibilityState_('visible');
      anim.activate();
      expect(anim.triggered_).to.be.true;
      expect(startStub).to.be.calledOnce;
    });

    it('should resume/pause when visibility changes', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      const startStub = sandbox.stub(anim, 'startOrResume_');
      const pauseStub = sandbox.stub(anim, 'pause_');
      anim.activate();
      expect(anim.triggered_).to.be.true;

      // Go to visible state.
      viewer.setVisibilityState_('visible');
      expect(startStub).to.be.calledOnce;
      expect(pauseStub).to.not.be.called;

      // Go to hidden state.
      viewer.setVisibilityState_('hidden');
      expect(pauseStub).to.be.calledOnce;
      expect(startStub).to.be.calledOnce;  // Doesn't chnage.
    });

    it('should NOT resume/pause when visible, but not triggered', () => {
      const anim = createAnim({trigger: 'visibility'}, {duration: 1001});
      const startStub = sandbox.stub(anim, 'startOrResume_');
      const pauseStub = sandbox.stub(anim, 'pause_');
      expect(anim.triggered_).to.be.false;

      // Go to visible state.
      viewer.setVisibilityState_('visible');
      expect(startStub).to.not.be.called;
      expect(pauseStub).to.not.be.called;

      // Go to hidden state.
      viewer.setVisibilityState_('hidden');
      expect(pauseStub).to.not.be.called;
      expect(startStub).to.not.be.called;
    });

    it('should create runner', () => {
      const anim = createAnim({trigger: 'visibility'},
          {duration: 1001, animations: []});
      anim.activate();
      runnerMock.expects('start').once();
      runnerMock.expects('finish').never();
      return anim.startOrResume_().then(() => {
        expect(anim.triggered_).to.be.true;
        expect(anim.runner_).to.exist;
      });
    });

    it('should finish animation and runner', () => {
      const anim = createAnim({trigger: 'visibility'},
          {duration: 1001, animations: []});
      anim.activate();
      runnerMock.expects('start').once();
      runnerMock.expects('finish').once();
      return anim.startOrResume_().then(() => {
        anim.finish();
        expect(anim.triggered_).to.be.false;
        expect(anim.runner_).to.be.null;
      });
    });

    it('should pause/resume animation and runner', () => {
      const anim = createAnim({trigger: 'visibility'},
          {duration: 1001, animations: []});
      anim.activate();
      runnerMock.expects('start').once();
      runnerMock.expects('pause').once();
      return anim.startOrResume_().then(() => {
        anim.pause_();
        expect(anim.triggered_).to.be.true;

        runnerMock.expects('resume').once();
        anim.startOrResume_();
        expect(anim.triggered_).to.be.true;
      });
    });

    it('should finish when animation is complete', () => {
      const anim = createAnim({trigger: 'visibility'},
          {duration: 1001, animations: []});
      anim.activate();
      return anim.startOrResume_().then(() => {
        expect(anim.triggered_).to.be.true;
        expect(anim.runner_).to.exist;

        runner.setPlayState_(WebAnimationPlayState.FINISHED);
        expect(anim.triggered_).to.be.false;
        expect(anim.runner_).to.be.null;
      });
    });

    it('should find target in the main doc', () => {
      const anim = createAnim({}, {duration: 1001});
      const target = win.document.createElement('div');
      target.setAttribute('id', 'target1');
      win.document.body.appendChild(target);
      expect(anim.resolveTarget_('target1')).to.equal(target);
    });
  });


  describes.realWin('in FIE', {
    amp: {
      ampdoc: 'fie',
      extensions: ['amp-animation'],
    },
  }, env => {
    let embed;

    beforeEach(() => {
      embed = env.embed;
      embed.setVisible_(false);
    });

    function createAnim(attrs, config) {
      return createAnimInWindow(embed.win, attrs, config);
    }

    it('should update visibility from embed', () => {
      const anim = createAnim({}, {duration: 1001});
      expect(anim.visible_).to.be.false;

      embed.setVisible_(true);
      expect(anim.visible_).to.be.true;
    });

    it('should find target in the embed only', () => {
      const parentWin = env.ampdoc.win;
      const embedWin = embed.win;
      const anim = createAnim({}, {duration: 1001});

      const targetInDoc = parentWin.document.createElement('div');
      targetInDoc.setAttribute('id', 'target1');
      parentWin.document.body.appendChild(targetInDoc);
      expect(anim.resolveTarget_('target1')).to.be.null;

      const targetInEmbed = embedWin.document.createElement('div');
      targetInEmbed.setAttribute('id', 'target1');
      embedWin.document.body.appendChild(targetInEmbed);
      expect(anim.resolveTarget_('target1')).to.equal(targetInEmbed);
    });
  });
});
