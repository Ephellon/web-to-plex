let script = {
	"url": "*://*.hulu.com/(watch|series|movie)/*",

	// SW1: title pages (/movie/…, /series/…) describe themselves in JSON-LD (Movie, TVSeries); /watch/ (the player, signed
	// in) keeps reading the player's lines
	"ready": () => (/^\/(series|movie)\//.test(top.location.pathname) ? script.getItem() != null : !$('[class$="__meta"]').empty),

	"init": () => {
		if(/^\/(series|movie)\//.test(top.location.pathname))
			return script.getItem() ?? 1000;

		const title = $('[class$="__second-line"]').first?.textContent.trim();

		if(!title)
			return 5000;

		return { type: script.getType(), title, year: (new Date).getFullYear(), image: null };
	},

	// The JSON-LD item whose `url` is this page: name, year (`releasedEvent.startDate`, the premiere for series), artwork
	"getItem": () => {
		const path = top.location.pathname.replace(/\/+$/, '');

		for(const element of $('script[type="application/ld+json"]')) {
			let data;

			try {
				data = JSON.parse(element.textContent);
			} catch {
				continue;
			}

			for(const item of [].concat(data?.['@graph'] ?? data)) {
				if(!item?.url || new URL(item.url, top.location.href).pathname.replace(/\/+$/, '') != path)
					continue;

				const type = item['@type'] == 'Movie' ? 'movie' : item['@type'] == 'TVSeries' ? 'show' : null;

				if(!type || !item.name)
					return -1;

				return { type, title: item.name.trim(), year: +(/\d{4}/.exec(item.releasedEvent?.startDate ?? item.dateCreated ?? '') ?? [0])[0] || null, image: item.image?.url ?? item.image };
			}
		}

		return null;
	},

	"getType": () => {
		let { pathname } = top.location;

		if(/^\/series\//.test(pathname)) {
			return 'show';
		} else {
			let tl = $('[class$="__third-line"]').first;

			return /^\s*$/.test((tl || {}).textContent || '')?
				'movie':
			'show';
		}
	},

	"minions": () => {
		let actions = $('.Details > .SimpleModalNav');

		if(actions.empty)
			return;

		actions.forEach(element => {
			let minion,
				sibling = $('.Nav__spacer ~ .Nav__item', element).last;

			let parent = furnish('div.Nav__item', {},
				minion = furnish('button.web-to-plex-minion', {},
					furnish('img', { src: IMAGES.icon_32 })
				)
			);

			addMinions(minion);
			element.insertBefore(parent, sibling);
		});
	},
};
