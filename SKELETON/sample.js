'use restrict';
module.exports = function (req, res) {
	res.set('Content-Type', 'text/plain');
	res.status(200).send("!! Welcome To Hell !! SKEL_NAME");
	res.end();
}
