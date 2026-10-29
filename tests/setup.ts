import 'fake-indexeddb/auto';

// jsdom does not implement layout APIs used by the UI.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
