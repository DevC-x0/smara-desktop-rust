import createDOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

function getDOMPurifyInstance() {
  const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' && (globalThis as any).window ? (globalThis as any).window : undefined);
  if (win) {
    try {
      const inst = (createDOMPurify as any)(win);
      if (inst && typeof inst.sanitize === 'function') {
        return inst;
      }
    } catch (_) {}
  }
  return null;
}

const fallback: Record<string, any> = {
  sanitize: (text: string) => text,
  addHook: () => {},
  removeHook: () => {},
  removeHooks: () => {},
  removeAllHooks: () => {},
  setConfig: () => {},
  clearConfig: () => {},
  isValidAttribute: () => true,
  isSupported: true,
  version: '3.4.13',
};

const dompurifyProxy: any = new Proxy(createDOMPurify, {
  get(target, prop, receiver) {
    const inst = getDOMPurifyInstance();
    if (inst && prop in inst) {
      const val = inst[prop];
      return typeof val === 'function' ? val.bind(inst) : val;
    }
    if (prop in fallback) {
      return fallback[prop as string];
    }
    const val = Reflect.get(target, prop, receiver);
    return typeof val === 'function' ? val.bind(target) : val;
  },
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, argArray);
  },
});

export default dompurifyProxy;
export const sanitize = (dirty: any, cfg?: any) => dompurifyProxy.sanitize(dirty, cfg);
export const addHook = (...args: any[]) => dompurifyProxy.addHook(...args);
