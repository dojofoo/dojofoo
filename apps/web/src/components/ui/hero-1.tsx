export function HeroSection() {
	return (
		<section className="mx-auto w-full max-w-5xl">
			<div className="relative flex flex-col items-center justify-center gap-5 pt-20 pb-6 px-4">
				<h1 className="sr-only">dojofoo</h1>
				<img
					src="/dojofoo.svg"
					alt="dojofoo"
					className="relative h-auto fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out w-36 sm:w-48 md:w-56"
				/>
			</div>
		</section>
	);
}
