import createDOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

let instance: any = null;

function getDOMPurifyInstance() {
  if (instance) return instance;
  const win = typeof window !== 'undefined' ? window : (globalThis as any).window;
  if (win) {
    instance = (createDOMPurify as any)(win);
    return instance;
  }
  return createDOMPurify;
}

const proxyDOMPurify = new Proxy(createDOMPurify, {
  get(target, prop, receiver) {
    const inst = getDOMPurifyInstance();
    if (inst && typeof inst === 'object' && prop in inst) {
      const val = inst[prop];
      return typeof val === 'function' ? val.bind(inst) : val;
    }
    const targetVal = Reflect.get(target, prop, receiver);
    return typeof targetVal === 'function' ? targetVal.bind(target) : targetVal;
  },
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, argArray);
  },
});

export default proxyDOMPurify;
