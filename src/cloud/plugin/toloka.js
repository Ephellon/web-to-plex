// Web to Plex - Toloka Plugin
// Aurthor(s) - @chmez (2017)
/* Minimal Required Layout *
	plugin {
		url:  string,
		init: function => ({ type:string, title:string, year:number|null|undefined })
	}
*/
// REQUIRED [plugin:object]: The plugin object
let plugin = {
	// REQUIRED [plugin.url]: this is what you ask Web to Plex access to; currently limited to a single domain
	"url": "*://*.toloka.to/*",

	// REQUIRED [plugin.init]: this is what Web to Plex will call on when the url is detected
	// it will always be fired after the page and Web to Plex have been loaded
	"init": () => {
		let heading = document.queryBy('.maintitle').first,
			match = /^(?:.*\/)?\s*([^/]+?)\s*\((\d{4})\)/.exec(heading? heading.textContent.trim(): '');

		// Only a release topic ("Назва / Original title (2024) …") names an item; other forum pages show nothing (PL3).
		// Before, the heading was kept whole when it did not end at the year, and a stale RegExp.$2 became the year
		if(!match)
			return -1;

		let title = match[1],
			// REQUIRED [title:string]
			// you have access to the exposed "helper.js" file within the extension

			year = +match[2],
			// PREFERRED [year:number, null, undefined]

			image = (document.queryBy('.postbody img').first || {}).src,
			// OPTIONAL [image:string]

			IMDbID = plugin.getID();

		// the rest of the code is up to you, but should be limited to a layout similar to this
		// REQUIRED [{ type:'movie', 'show'; title:string; year:number }]
		// PREFERRED [{ image:string; IMDbID:string; TMDbID:string, number; TVDbID:string, number }]
		return {
			type: 'movie',
			title,
			year,
			image,
			IMDbID
		};
	},

	// OPTIONAL: the rest of this code is purely for functionality
	"getID": () => {
		let links = document.queryBy('.postlink'),
			regex = /^https?\:\/\/(?:w{3}\.)?imdb\.com\/title\/(tt\d+)/i;

		for(let link in links)
			if(regex.test(links[link]))
				return RegExp.$1;
	}
};
