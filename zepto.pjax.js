// zepto.pjax.js
// copyright chris wanstrath
// https://github.com/defunkt/jquery-pjax
//
/* jslint undef: true, browser: true, unparam: true, sloppy: true,
   vars: true, white: true, nomen: true, regexp: true, maxerr: 50, indent: 4 */
(function($, _gaq) {
    // Internal: Find container element for a variety of inputs.
    //
    // Because we can't persist elements using the history API, we must be
    // able to find a String selector that will consistently find the Element.
    //
    // container - A selector String, Zepto object, or DOM Element.
    //
    // Returns a Zepto object whose context is `document` and has a selector.
    function findContainerFor(container) {
        container = $(container);

        if (!container.length ) {
            throw "no pjax container for " + container.selector;
        }

        if (container.selector !== '' && container.context === document) {
            return container;
        }

        if (container.attr('id')) {
            return $('#' + container.attr('id'));
        }

        throw "cant get selector for pjax container!";
    }

    // Internal: Build options Object for arguments.
    //
    // For convenience the first parameter can be either the container or
    // the options object.
    //
    // Examples
    //
    //   optionsFor('#container')
    //   // => {container: '#container'}
    //
    //   optionsFor('#container', {push: true})
    //   // => {container: '#container', push: true}
    //
    //   optionsFor({container: '#container', push: true})
    //   // => {container: '#container', push: true}
    //
    // Returns options Object.
    function optionsFor(container, options) {
        // Both container and options
        if (container && options) {
            options.container = container;
        // First argument is options Object
        } else if ($.isPlainObject(container)) {
            options = container;
        // Only container
        } else {
            options = {container: container};
        }

        // Find and validate container
        if (options.container) {
            options.container = findContainerFor(options.container);
        }

        return options;
    }

    // Public: pjax on click handler
    //
    // Exported as $.pjax.click.
    //
    // event   - "click" Zepto.Event
    // options - pjax options
    //
    // Examples
    //
    //   $('a').live('click', $.pjax.click)
    //   // is the same as
    //   $('a').pjax()
    //
    //  $(document).on('click', 'a', function(event) {
    //    var container = $(this).closest('[data-pjax-container]')
    //    return $.pjax.click(event, container)
    //  })
    //
    // Returns false if pjax runs, otherwise nothing.
    function handleClick(event, container, options) {

        options = optionsFor(container, options);

        var link = event.currentTarget;

        // Middle click, cmd click, and ctrl click should open
        // links in a new tab as normal.
        if (event.which > 1 || event.metaKey) {
            return;
        }

        // Ignore cross origin links
        if (location.protocol !== link.protocol || location.host !== link.host) {
            return;
        }

        // Ignore anchors on the same page
        if (link.hash && link.href.replace(link.hash, '') ===
                location.href.replace(location.hash, '')) {
            return;
        }

        var defaults = {
            url: link.href,
            container: $(link).attr('data-pjax'),
            clickedElement: $(link),
            fragment: null
        };

        $.pjax($.extend({}, defaults, options));

        event.preventDefault();

        return false;
    }

    // When called on a link, fetches the href with ajax into the
    // container specified as the first parameter or with the data-pjax
    // attribute on the link itself.
    //
    // Tries to make sure the back button and ctrl+click work the way
    // you'd expect.
    //
    // Accepts a Zepto ajax options object that may include these
    // pjax specific options:
    //
    // container - Where to stick the response body. Usually a String selector.
    //             $(container).html(xhr.responseBody)
    //      push - Whether to pushState the URL. Defaults to true (of course).
    //   replace - Want to use replaceState instead? That's cool.
    //
    // For convenience the first parameter can be either the container or
    // the options object.
    //
    // Returns the Zepto object
    $.fn.pjax = function(container, options) {
        options = optionsFor(container, options);

        return this.live('click', function(event) {
            return handleClick(event, options);
        });
    };

    // Internal: Strips _pjax=true param from url
    //
    // url - String
    //
    // Returns String.
    function stripPjaxParam(url) {
        return url
            .replace(/\?_pjax=true&?/, '?')
            .replace(/_pjax=true&?/, '')
            .replace(/\?$/, '');
    }

    // Internal: Parse URL components and returns a Locationish object.
    //
    // url - String URL
    //
    // Returns HTMLAnchorElement that acts like Location.
    function parseURL(url) {
        var a = document.createElement('a');
        a.href = url;
        return a;
    }

    // Loads a URL with ajax, puts the response body inside a container,
    // then pushState()'s the loaded URL.
    //
    // Works just like $.ajax in that it accepts a Zepto ajax
    // settings object (with keys like url, type, data, etc).
    //
    // Accepts these extra keys:
    //
    // container - Where to stick the response body.
    //             $(container).html(xhr.responseBody)
    //      push - Whether to pushState the URL. Defaults to true (of course).
    //   replace - Want to use replaceState instead? That's cool.
    //
    // Use it just like $.ajax:
    //
    //   var xhr = $.pjax({ url: this.href, container: '#main' })
    //   console.log( xhr.readyState )
    //
    // Returns whatever $.ajax returns.
    var pjax = function(options) {
        options = $.extend(true, {}, $.ajaxSettings, pjax.defaults, options);

        if ($.isFunction(options.url)) {
            options.url = options.url();
        }

        var url  = options.url;
        var hash = parseURL(url).hash;
        var timeoutTimer;

        options.context = findContainerFor(options.container);

        options.beforeSend = function(xhr, settings) {
            var context = this;
            var event;
            var result;

            url = stripPjaxParam(settings.url);

            if (settings.timeout > 0) {
                timeoutTimer = setTimeout(function() {
                    event = $.Event('pjax:timeout');
                    context.trigger(event, [xhr, options]);
                    if (event.result !== false) {
                        xhr.abort('timeout');
                    }
                }, settings.timeout);

                // Clear timeout setting so Zeptos internal timeout isn't invoked
                settings.timeout = 0;
            }

            xhr.setRequestHeader('X-PJAX', 'true');

            event = $.Event('pjax:beforeSend');
            this.trigger(event, [xhr, settings]);
            result = event.result;

            if (result === false) {
                return false;
            }

            this.trigger('pjax:start', [xhr, options]);
        };

        options.complete = function(xhr, textStatus) {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
            }

            this.trigger('pjax:complete', [xhr, textStatus, options]);
            this.trigger('pjax:end', [xhr, options]);
        };

        options.error = function(xhr, textStatus, errorThrown) {
            var respUrl = xhr.getResponseHeader('X-PJAX-URL');

            if (respUrl) {
                url = stripPjaxParam(respUrl);
            }

            var event = $.Event('pjax:error');

            this.trigger(event, [xhr, textStatus, errorThrown, options]);

            if (textStatus !== 'abort' && event.result !== false) {
                window.location = url;
            }
        };

        options.success = function(data, status, xhr) {
            var respUrl = xhr.getResponseHeader('X-PJAX-URL');

            if (respUrl) {
                url = stripPjaxParam(respUrl);
            }

            var title, oldTitle = document.title;

            if (options.fragment) {
                // If they specified a fragment, look for it in the response
                // and pull it out.
                var html = $('<html>').html(data);
                var $fragment = html.find(options.fragment);

                if ($fragment.length) {
                    this.html($fragment.contents());

                    // If there's a <title> tag in the response, use it as
                    // the page's title. Otherwise, look for data-title and title attributes.
                    title = html.find('title').text() || $fragment.attr('title') || $fragment.data('title');
                } else {
                    window.location = url;
                }
            } else {
                // If we got no data or an entire web page, go directly
                // to the page and let normal error handling happen.
                if (!$.trim(data) || /<html/i.test(data)) {
                    window.location = url;
                }

                this.html(data);

                // If there's a <title> tag in the response, use it as
                // the page's title.
                title = this.find('title').remove().text();
            }

            if (title) {
                document.title = $.trim(title);
            }

            var state = {
                url: url,
                pjax: this.selector,
                fragment: options.fragment,
                timeout: options.timeout
            };

            if (options.replace) {
                pjax.active = true;
                window.history.replaceState(state, document.title, url);
            } else if (options.push) {
                // this extra replaceState before first push ensures good back
                // button behavior
                if (!pjax.active) {
                    window.history.replaceState($.extend({}, state, {url:null}), oldTitle);
                    pjax.active = true;
                }

                window.history.pushState(state, document.title, url);
            }

            // Google Analytics support
            if ((options.replace || options.push) && _gaq) {
                _gaq.push(['_trackPageview']);
            }

            // If the URL has a hash in it, make sure the browser
            // knows to navigate to the hash.
            if (hash !== '') {
                window.location.href = hash;
            }

            this.trigger('pjax:success', [data, status, xhr, options]);
        };

        // Cancel the current request if we're already pjaxing
        var xhr = pjax.xhr;

        if ( xhr && xhr.readyState < 4) {
            xhr.onreadystatechange = $.noop;
            xhr.abort();
        }

        pjax.options = options;
        pjax.xhr = $.ajax(options);

        $(document).trigger('pjax', [pjax.xhr, options]);

        return pjax.xhr;
    };

    pjax.defaults = {
        timeout: 650,
        push: true,
        replace: false,
        // We want the browser to maintain two separate internal caches: one for
        // pjax'd partial page loads and one for normal page loads. Without
        // adding this secret parameter, some browsers will often confuse the two.
        data: { _pjax: true },
        type: 'GET',
        dataType: 'html'
    };

    // Export $.pjax.click
    pjax.click = handleClick;


    // Used to detect initial (useless) popstate.
    // If history.state exists, assume browser isn't going to fire initial popstate.
    var popped = window.history.hasOwnProperty('state'),
        initialURL = location.href;

    // define pjax on Zepto object
    $.pjax = pjax;

    // popstate handler takes care of the back and forward buttons
    //
    // You probably shouldn't use pjax on pages with other pushState
    // stuff yet.
    $(window).bind('popstate', function(event) {
        // Ignore inital popstate that some browsers fire on page load
        var initialPop = !popped && location.href === initialURL;

        popped = true;

        if (initialPop) {
            return;
        }

        var state = event.state;

        if (state && state.pjax) {
            var container = state.pjax;

            if ($(container + '').length) {
                $.pjax({
                    url: state.url || location.href,
                    fragment: state.fragment,
                    container: container,
                    push: false,
                    timeout: state.timeout
                });
            } else {
                window.location = location.href;
            }
        }
    });


    // Add the state property to Zepto's event object so we can use it in
    // $(window).bind('popstate')
    if ($.inArray('state', $.event.props) < 0) {
        $.event.props.push('state');
    }


    // Is pjax supported by this browser?
    $.support.pjax =
        window.history && window.history.pushState && window.history.replaceState
            // pushState isn't reliable on iOS until 5.
            && !navigator.userAgent.match(/((iPod|iPhone|iPad).+\bOS\s+[1-4]|WebApps\/.+CFNetwork)/);


    // Fall back to normalcy for older browsers.
    if (!$.support.pjax) {
        $.pjax = function(options) {
            var url = $.isFunction(options.url) ? options.url() : options.url,
                method = options.type ? options.type.toUpperCase() : 'GET',
                key,
                form,
                data,
                pair;

            form = $('<form>', {
                method: method === 'GET' ? 'GET' : 'POST',
                action: url,
                style: 'display:none'
            });

            if (method !== 'GET' && method !== 'POST') {
                form.append($('<input>', {
                    type: 'hidden',
                    name: '_method',
                    value: method.toLowerCase()
                }));
            }

            data = options.data;

            if (typeof data === 'string') {
                $.each(data.split('&'), function(index, value) {
                    pair = value.split('=');
                    form.append($('<input>', {type: 'hidden', name: pair[0], value: pair[1]}));
                });
            } else if (typeof data === 'object') {
                for (key in data) {
                    if (data.hasOwnProperty(key)) {
                        form.append($('<input>', {type: 'hidden', name: key, value: data[key]}));
                    }
                }
            }

            $(document.body).append(form);

            form.submit();
        };

        $.pjax.click = $.noop;

        $.fn.pjax = function() {
            return this;
        };
    }

} (window.Zepto, window._gaq));
