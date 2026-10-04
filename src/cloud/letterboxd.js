let script = {
	"url": "*://*.letterboxd.com/(?:\\w+/)?(film|list)/*",

	"ready": () => (script.getType('list')? true: !$('.js-watch-panel, .watch-panel').empty),

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		let title, year, image, type = script.getType(), IMDbID;

		switch(type) {
			case 'movie':
				title  = $('#featured-film-header .headline-1, .headline-1[itemprop="name"], h1.headline-1').first.textContent.trim();
				year   = +$('#featured-film-header [href*="/year/"], small[itemprop="datePublished"], a[href*="/films/year/"]').first.textContent.trim();
				image  = script.getPoster();
				IMDbID = script.getIMDbID(type);

				return { type, title, year, image, IMDbID };
				break;

			case 'list':
				// LB1: list rows are `li.posteritem` now (2026)
				let items = $('li.posteritem, .poster-list .poster-container, .poster-list .film-detail'),
					options = [];

				items.forEach((element, index, array) => {
					let option = script.process(element);

					if(option)
						options.push(option);
				});

				return options;
				break;

			default:
				/* Error */
				return {};
		}
	},

	"getType": (suspectedType) => {
		let type = /^\/(film)\//i.test(top.location.pathname)? 'movie': 'list';

		if(suspectedType)
			return type == suspectedType;

		return type;
	},

	"getIMDbID": (type) => {
		if(type == 'movie') {
			let link = $(
				'.track-event[href*="imdb.com/title/tt"i]'
			);

			if(!link.empty) {
				link = link.first.href.replace(/^.*imdb\.com\/title\//i, '');

				return link.replace(/\/(?:maindetails\/?)?$/, '');
			}
		}
	},

	// LB1: the film's poster from the page's JSON-LD (`Movie.image`; og:image is a wide backdrop), else a loaded poster
	// image (the first `.film-poster img` is Letterboxd's empty-poster placeholder until it loads)
	"getPoster": () => {
		for(const element of $('script[type="application/ld+json"]')) {
			try {
				const data = JSON.parse(element.textContent.replace(/\/\*[^]*?\*\//g, ''));

				if(data?.['@type'] == 'Movie' && data.image)
					return data.image;
			} catch {
				continue;
			}
		}

		return [...$('.film-poster img, .image')].map(image => image.src).find(src => src && !/empty-poster/.test(src));
	},

	// One list row (LB1): the poster's `data-item-name` ("Harakiri (1962)"), or the frame title on older markup
	"process": (element) => {
		const name = element.querySelector('[data-item-name]')?.getAttribute('data-item-name') ?? element.querySelector('.frame-title')?.textContent ?? ''
			, [, title, year] = /^\s*(.+?)\s*(?:\((\d{4})\))?\s*$/.exec(name) ?? []
			, image = element.querySelector('img')?.src;

		if(!title)
			return null;

		return { type: 'movie', title, year: +year || null, image: /empty-poster/.test(image ?? '') ? void null : image };
	},

	"minions": () => {
		let actions = $('.actions-panel ul, .js-watch-panel .services, #watch').first,
			type = script.getType();

		// T13: no panel (yet) → nothing to add to; read its id only after this check
		if(!actions)
			return;

		let featured = (actions.id == 'watch');

		let minion, parent;

		if(type == 'list') {
			parent = furnish('li', {},
				furnish('span', {},
					furnish('span.has-icon.icon-16', {},
						furnish('img.web-to-plex-icon.icon', { style: 'background: none !important', src: IMAGES.icon_16, height: 16, width: 16 }),
						minion = furnish('a.web-to-plex-minion', {}, 'Web to Plex')
					)
				),
			);

			addMinions(minion);
			actions.appendChild(parent);
		} else if(featured) {
			parent = furnish('div.other', {},
				furnish('img.web-to-plex-icon', { src: IMAGES.icon_16, height: 16, width: 16 }),
				minion = furnish('a.web-to-plex-minion.label.more', {}, 'Web to Plex')
			);

			addMinions(minion);
			actions.appendChild(parent);
		} else {
			parent = furnish('p.service', { style: 'display: flex !important' },
				minion = furnish('a.web-to-plex-minion.label.tooltip', {},
					furnish('span.brand', {},
						furnish('img', { src: IMAGES.icon_32, height: 24, width: 24 })
					),
					furnish('span.title', {},
						furnish('span.name', {}, 'Web to Plex')
					)
				)
			);

			addMinions(minion);
			actions.appendChild(parent);
		}
	},
};
