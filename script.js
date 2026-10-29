const recipeCarousel = document.querySelector('#recipeCarousel');
const recipeTrack = recipeCarousel?.querySelector('.landing-recipe-track');

if (recipeTrack && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const recipeSlides = [...recipeTrack.querySelectorAll('.landing-recipe-slide')];

    if (recipeSlides.length > 1) {
        let isAutoScrolling = false;
        let resumeAfter = 0;

        const pauseAfterInteraction = () => {
            resumeAfter = Date.now() + 7000;
        };

        recipeCarousel.addEventListener('pointerdown', pauseAfterInteraction, { passive: true });
        recipeCarousel.addEventListener('touchstart', pauseAfterInteraction, { passive: true });
        recipeCarousel.addEventListener('wheel', pauseAfterInteraction, { passive: true });
        recipeCarousel.addEventListener('focusin', pauseAfterInteraction);

        window.setInterval(() => {
            const carouselBounds = recipeCarousel.getBoundingClientRect();
            const isVisible = carouselBounds.bottom > 0 && carouselBounds.top < window.innerHeight;
            if (!isVisible || document.hidden || recipeCarousel.matches(':hover')
                || recipeCarousel.contains(document.activeElement) || Date.now() < resumeAfter || isAutoScrolling) {
                return;
            }

            const maxScroll = recipeTrack.scrollWidth - recipeTrack.clientWidth;
            if (maxScroll <= 0) {
                return;
            }

            const currentScroll = recipeTrack.scrollLeft;
            const nextScroll = currentScroll >= maxScroll - 8
                ? 0
                : Math.min(currentScroll + recipeTrack.clientWidth, maxScroll);

            isAutoScrolling = true;
            recipeTrack.scrollTo({ left: nextScroll, behavior: 'smooth' });
            window.setTimeout(() => {
                isAutoScrolling = false;
            }, 900);
        }, 3000);
    }
}