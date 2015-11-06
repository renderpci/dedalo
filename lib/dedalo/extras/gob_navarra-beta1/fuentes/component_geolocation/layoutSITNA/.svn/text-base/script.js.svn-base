$(function () {
    $('.right-panel > h1').on('click', function (e) {
        var $tab = $(e.target);
        var $panel = $tab.parent();
        $panel.toggleClass('right-collapsed');
    });

    $('.left-panel > h1').on('click', function (e) {
        var $tab = $(e.target);
        var $panel = $tab.parent();
        $panel.toggleClass('left-collapsed');
    });

    $('.tools-panel').on('click', function (e) {
        var $tab = $(e.target);
        if ($tab.is('h2')) {
            $tab.parent().toggleClass(TC.Consts.classes.COLLAPSED);
        }
    });

    var $ovPanel = $('.ovmap-panel');
    var map = $ovPanel.parent().data('map');
    if (map) {
        map.loaded(function () {
            var collapse = function () {
                $ovPanel.addClass('right-collapsed');
                setTimeout(function () {
                    $('.slide-panel').css('opacity', '1');
                }, 150);
            }
            for (var i = 0; i < map.controls.length; i++) {
                var ctl = map.controls[i];
                if (ctl instanceof TC.control.OverviewMap) {
                    ctl.loaded(collapse);
                }
            }
        });

        // En pantalla estrecha colapsar panel de herramientas al activar una
        map.$events.on(TC.Consts.event.CONTROLACTIVATE, function (e) {
            var control = e.control;
            if (control instanceof TC.control.Measure) {
                if (Modernizr.canvas) {
                    // Not for IE8
                    var $toolsPanel = $('.tools-panel');
                    if (parseInt($(control.map.div).css('width')) <
                        parseInt(control._$div.find('.' + control.CLASS + (control.searchType === TC.Consts.LENGTH ? '-len' : '-area')).css('width')) +
                        parseInt($toolsPanel.css('width'))) {
                        $toolsPanel.addClass('right-collapsed');
                    }
                }
                else {
                    // Fix bug IE8
                    setTimeout(function () {
                        e.control._$div.find('.tc-ctl-btn').each(function (idx, elm) {
                            var $elm = $(elm);
                            $elm.css('visibility', 'hidden').css('visibility', 'visible');
                        });
                    }, 500);
                }
            }
        });
    }

    TC.loadJS(
        Modernizr.touch,
        TC.apiLocation + 'jQuery/jquery.touchSwipe.min.js',
        function (url, result) {
            if (result) {
                var $right = $('.right-panel').swipe({
                    swipeRight: function () {
                        $(this).addClass('right-collapsed');
                    }
                });
                var $left = $('.left-panel').swipe({
                    swipeLeft: function () {
                        $(this).addClass('left-collapsed');
                    }
                });

                $right.find('h1,li,a').addClass('noSwipe');
                $left.find('h1,li,a').addClass('noSwipe');
            }
        }
    );
});