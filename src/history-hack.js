/* Runs in the page's own world (manifest "world": "MAIN"), so it can wrap the page's history methods directly.
 * The isolated-world site scripts listen for the 'pushstate-changed' event this dispatches on window. */

(history => {
	let __pushState__ = history.pushState,
		__replaceState__ = history.replaceState;

	history.pushState = function(state, title, url) {
		__pushState__.call(this, state, title, url);

		window.dispatchEvent(new CustomEvent('pushstate-changed', { detail: state }));
	};

	history.replaceState = function(state, title, url) {
		__replaceState__.call(this, state, title, url);

		window.dispatchEvent(new CustomEvent('pushstate-changed', { detail: state }));
	};
})(window.history);
