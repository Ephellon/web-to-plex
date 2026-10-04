let script = {
	"url": "*://*.allocine.fr/(film|series)/*",

	"init": (ready) => {
		let _title, _year, _image, R = RegExp;

		// AC1: series pages have no `.date`; their first info line reads "2016 - 2025 | 55 min | …"
		let title = $('.titlebar-title').first,
			year  = $('.date, .meta-body font, .meta-body-info').first,
			image = $('.thumbnail-img').first,
			type  = script.getType();

		if(!title || !year)
			return 1000;

		title = title.textContent.trim();
		image = image?.src;

		year = +(/\d{4}/.exec(year.textContent) ?? [])[0] || null;

		return { type, title, year, image };
	},

	"getType": () => {
		let { pathname } = top.location;

		// AC1: the runner's types are 'movie' and 'show'
		return /\/(film)\//.test(pathname)? 'movie': 'show';
	},
};
