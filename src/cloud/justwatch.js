let script = {
	"url": "*://*.justwatch.com/(\\w{2})/(tv(?:-show)|movie)/*",

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		let title = $('.title-block, .title-detail-hero__details__title').first,
			year  = $('.title-block .text-muted, .title-detail-hero__details__title .release-year').first,
			image = $('.title-poster__image').first,
			type  = script.getType();

		if(!title || !year)
			return 1000;

		year  = year.textContent;
		title = (title.localName == 'h1'? title.textContent.replace(year, ''): title.firstElementChild.firstChild.textContent).trim();
		year  = +year.replace(/\D+/g, '');
		image = image?.src ?? script.getImage();

		return { type, title, year, image };
	},

	// The poster from the page's JSON-LD: the Movie/TVSeries `image` points (`@id`) at an ImageObject with the URL. The
	// `.title-poster__image` element is gone (2026)
	"getImage": () => {
		const items = [];

		for(const element of $('script[type="application/ld+json"]')) {
			try {
				const data = JSON.parse(element.textContent);

				items.push(...[].concat(data?.['@graph'] ?? data));
			} catch {
				continue;
			}
		}

		const title = items.find(item => /^(Movie|TVSeries)$/.test(item?.['@type']) && item.image)
			, image = title?.image;

		if(typeof image == 'string')
			return image;

		return image?.url ?? (items.find(item => item?.['@type'] == 'ImageObject' && item['@id'] == image?.['@id']) ?? items.find(item => item?.['@type'] == 'ImageObject'))?.url;
	},

	"getType": () => {
		let { pathname } = top.location;

		if(/^(\/\w{2})?\/tv(-show)?\//.test(pathname))
			return 'show';
		else
			return 'movie';
	},
};
