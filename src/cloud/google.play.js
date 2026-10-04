let script = {
	"url": "*://play.google.com/store/(movies|tv)/details/*",

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		// GP1: the year is in the line after the heading ("2026 • 105 minutes"), the poster is `img[itemprop="image"]`;
		// `h1 ~ div span` and `img[alt="cover art"]` are gone, and reading them threw
		let type  = script.getType(),
			title = $('h1 [itemprop="name"], h1').first,
			line  = title?.closest('h1')?.parentElement?.nextElementSibling,
			image = $('img[itemprop="image"], img[alt="cover art" i]').first,
			year;

		if(!title)
			return 1000;

		let [, name, named] = /^\s*(.+?)\s*(?:\(\s*(\d{4})\s*\).*)?$/.exec(title.textContent) ?? [];

		title = name;
		year = +(named ?? (/\b(1[89]\d{2}|2\d{3})\b/.exec(line?.textContent ?? '') ?? [])[1]) || null;
		image = image?.src;

		return { type, title, year, image };
	},

	"getType": () => (
		location.pathname.startsWith('/store/movies')?
			'movie':
		'show'
	),

	"minions": () => {
		let type = script.getType();

		let actions = $('wishlist-add, wishlist-added');

		if(actions.empty)
			return;


		actions.forEach(element => {
			while(/c-wiz/i.test(element.parentElement.tagName))
				element = element.parentElement;
			element = element.parentElement;

			let next, first, second;

			if(type == 'movie') {
				next = element.nextElementSibling.firstElementChild;
				first = next.firstChild;
				second = first.firstChild;
			} else {
				next = furnish('div', {},
					first = furnish('span.wtp-w', {},
						second = furnish('button.wtp-b')
					)
				);

				element.appendChild(next);
			}

			let minion;
			let parent = furnish(`span.${['wtp-w', ...first.classList].join('.')}`, {},
				furnish(`button.${['wtp-b', ...second.classList].join('.')}`, {},
					minion = furnish('a.web-to-plex-minion', {}, 'Web to Plex')
				)
			);

			addMinions(parent, minion);
			next.insertBefore(parent, first);
		});
	},
};
