let script = {
	// T10: list pages too (/movie, /tv/top-rated, /list/<id>…); the old glob only took title pages, so the list branch never ran
	"url": "*://*.themoviedb.org/(movie|tv|list)(/[\\w\\-]+)?(?*)?$",

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		let type   = script.getType(),
			TMDbID = script.getTMDbID(),
			title, year, image;

		let options;

		switch(type) {
			case 'movie':
			case 'tv':
				title = $('.title > span > *:not(.release_date), .title h2 > a').first;
				year  = $('.title .release_date').first;
				image = $('img.poster').first;

				title = title.textContent.trim();
				year  = +year.textContent.replace(/\(|\)/g, '').trim();
				image = (image || {}).src;

				if(type != 'movie')
					type = 'show';

				options = { type, title, year, image, TMDbID };
				break;

			case 'list':
				// T10: a user list (/list/<id>) describes its items in JSON-LD; the popular and top-rated pages render
				// cards (`div[data-object-id]` with a titled link). `.item.card` is gone
				options = script.getListData();

				if(!options.length)
					$('[data-object-id]:has(a[data-media-type] h2)').forEach(element => {
						let option = script.process(element);

						if(option)
							options.push(option);
					});

				if(!options.length)
					return 1000;
				break;

			default: return null;
		}

		return options;
	},

	"getType": () => {
		let { pathname } = top.location,
			title = /^\/(movie|tv)\/\d+/.exec(pathname);

		return title?
			title[1]:
		(/^\/((movie|tv)(\/[a-z\-]+)?|list\/\d+[\w\-]*)\/?$/i.test(pathname))?
			'list':
		'error';
	},

	// A user list's items from its JSON-LD ItemList (wrapped in CDATA comments)
	"getListData": () => {
		for(let element of $('script[type="application/ld+json"]')) {
			let data;

			try {
				data = JSON.parse(element.textContent.replace(/\/\*[^]*?\*\//g, ''));
			} catch {
				continue;
			}

			if(data?.['@type'] != 'ItemList')
				continue;

			return [].concat(data.itemListElement ?? [])
				.map(item => {
					let [, kind, TMDbID] = /\/(movie|tv)\/(\d+)/.exec(item?.url ?? '') ?? [];

					if(!kind || !item.name)
						return null;

					return { type: kind == 'movie'? 'movie': 'show', title: item.name.trim(), year: +(/\d{4}/.exec(item.dateCreated ?? '') ?? [])[0] || null, image: item.image, TMDbID: +TMDbID };
				})
				.filter(item => item);
		}

		return [];
	},

	"getTMDbID": () => {
		return +top.location.pathname.replace(/\/(?:movie|tv)\/(\d+).*/, '$1');
	},

	// T10: one card, read inside `element` (the old code queried the whole page, so every card was the first one)
	"process": (element) => {
		let link  = element.querySelector('a[data-media-type][href*="/movie/"], a[data-media-type][href*="/tv/"]'),
			title = link?.querySelector('h2')?.textContent.trim(),
			[, kind, TMDbID] = /\/(movie|tv)\/(\d+)/.exec(link?.getAttribute('href') ?? '') ?? [];

		if(!title || !kind)
			return null;

		return {
			type: kind == 'movie'? 'movie': 'show',
			title,
			year: +(/\d{4}/.exec(element.querySelector('.release_date')?.textContent ?? '') ?? [])[0] || null,
			image: element.querySelector('img.poster')?.src,
			TMDbID: +TMDbID,
		};
	},

	"minions": () => {
		let actions = $('.header .actions');

		if(actions.empty)
			return;

		actions.forEach(element => {
			let minion;

			let parent = furnish('li.tooltip.use_tooltip', { title: 'Web to Plex' },
				minion = furnish('a.web-to-plex-minion', { style: `background: url("${ IMAGES.icon_32 }") center/50% no-repeat !important` })
			);

			addMinions(minion);
			element.insertBefore(parent, element.lastElementChild);
		});
	},
};
