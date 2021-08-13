(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_custom_element_data(node, prop, value) {
        if (prop in node) {
            node[prop] = value;
        }
        else {
            attr(node, prop, value);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
            'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/VirtualInfiniteList.svelte generated by Svelte v3.37.0 */

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-1kggtm4-style";
    	style.textContent = "virtual-infinite-list-viewport.svelte-1kggtm4{position:relative;overflow-y:auto;-webkit-overflow-scrolling:touch;display:block}virtual-infinite-list-contents.svelte-1kggtm4,virtual-infinite-list-row.svelte-1kggtm4{display:block}virtual-infinite-list-row.svelte-1kggtm4{overflow:hidden}";
    	append(document.head, style);
    }

    const get_empty_slot_changes = dirty => ({});
    const get_empty_slot_context = ctx => ({});
    const get_loader_slot_changes_2 = dirty => ({});
    const get_loader_slot_context_2 = ctx => ({});
    const get_loader_slot_changes_1 = dirty => ({});
    const get_loader_slot_context_1 = ctx => ({});

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[50] = list[i];
    	return child_ctx;
    }

    const get_item_slot_changes = dirty => ({ item: dirty[0] & /*visible*/ 512 });
    const get_item_slot_context = ctx => ({ item: /*row*/ ctx[50].data });
    const get_loader_slot_changes = dirty => ({});
    const get_loader_slot_context = ctx => ({});

    // (428:4) {:else}
    function create_else_block(ctx) {
    	let current;
    	const loader_slot_template = /*#slots*/ ctx[29].loader;
    	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[28], get_loader_slot_context_2);

    	return {
    		c() {
    			if (loader_slot) loader_slot.c();
    		},
    		m(target, anchor) {
    			if (loader_slot) {
    				loader_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (loader_slot) {
    				if (loader_slot.p && dirty[0] & /*$$scope*/ 268435456) {
    					update_slot(loader_slot, loader_slot_template, ctx, /*$$scope*/ ctx[28], dirty, get_loader_slot_changes_2, get_loader_slot_context_2);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loader_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loader_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (loader_slot) loader_slot.d(detaching);
    		}
    	};
    }

    // (416:4) {#if visible.length > 0}
    function create_if_block_1(ctx) {
    	let t0;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t1;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = /*loading*/ ctx[0] && /*direction*/ ctx[1] !== "bottom" && create_if_block_3(ctx);
    	let each_value = /*visible*/ ctx[9];
    	const get_key = ctx => /*row*/ ctx[50].index;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let if_block1 = /*loading*/ ctx[0] && /*direction*/ ctx[1] !== "top" && create_if_block_2(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*loading*/ ctx[0] && /*direction*/ ctx[1] !== "bottom") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*loading, direction*/ 3) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (dirty[0] & /*visible, uniqueKey, $$scope*/ 268435976) {
    				each_value = /*visible*/ ctx[9];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, t1.parentNode, outro_and_destroy_block, create_each_block, t1, get_each_context);
    				check_outros();
    			}

    			if (/*loading*/ ctx[0] && /*direction*/ ctx[1] !== "top") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*loading, direction*/ 3) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (417:6) {#if loading && direction !== 'bottom'}
    function create_if_block_3(ctx) {
    	let current;
    	const loader_slot_template = /*#slots*/ ctx[29].loader;
    	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[28], get_loader_slot_context);

    	return {
    		c() {
    			if (loader_slot) loader_slot.c();
    		},
    		m(target, anchor) {
    			if (loader_slot) {
    				loader_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (loader_slot) {
    				if (loader_slot.p && dirty[0] & /*$$scope*/ 268435456) {
    					update_slot(loader_slot, loader_slot_template, ctx, /*$$scope*/ ctx[28], dirty, get_loader_slot_changes, get_loader_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loader_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loader_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (loader_slot) loader_slot.d(detaching);
    		}
    	};
    }

    // (422:44) Template Not Found!!!
    function fallback_block(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Template Not Found!!!");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (420:6) {#each visible as row (row.index)}
    function create_each_block(key_1, ctx) {
    	let virtual_infinite_list_row;
    	let virtual_infinite_list_row_id_value;
    	let current;
    	const item_slot_template = /*#slots*/ ctx[29].item;
    	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[28], get_item_slot_context);
    	const item_slot_or_fallback = item_slot || fallback_block();

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			virtual_infinite_list_row = element("virtual-infinite-list-row");
    			if (item_slot_or_fallback) item_slot_or_fallback.c();
    			set_custom_element_data(virtual_infinite_list_row, "id", virtual_infinite_list_row_id_value = "_item_" + String(/*row*/ ctx[50].data[/*uniqueKey*/ ctx[3]]));
    			set_custom_element_data(virtual_infinite_list_row, "class", "svelte-1kggtm4");
    			this.first = virtual_infinite_list_row;
    		},
    		m(target, anchor) {
    			insert(target, virtual_infinite_list_row, anchor);

    			if (item_slot_or_fallback) {
    				item_slot_or_fallback.m(virtual_infinite_list_row, null);
    			}

    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (item_slot) {
    				if (item_slot.p && dirty[0] & /*$$scope, visible*/ 268435968) {
    					update_slot(item_slot, item_slot_template, ctx, /*$$scope*/ ctx[28], dirty, get_item_slot_changes, get_item_slot_context);
    				}
    			}

    			if (!current || dirty[0] & /*visible, uniqueKey*/ 520 && virtual_infinite_list_row_id_value !== (virtual_infinite_list_row_id_value = "_item_" + String(/*row*/ ctx[50].data[/*uniqueKey*/ ctx[3]]))) {
    				set_custom_element_data(virtual_infinite_list_row, "id", virtual_infinite_list_row_id_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(item_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(item_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(virtual_infinite_list_row);
    			if (item_slot_or_fallback) item_slot_or_fallback.d(detaching);
    		}
    	};
    }

    // (425:6) {#if loading && direction !== 'top'}
    function create_if_block_2(ctx) {
    	let current;
    	const loader_slot_template = /*#slots*/ ctx[29].loader;
    	const loader_slot = create_slot(loader_slot_template, ctx, /*$$scope*/ ctx[28], get_loader_slot_context_1);

    	return {
    		c() {
    			if (loader_slot) loader_slot.c();
    		},
    		m(target, anchor) {
    			if (loader_slot) {
    				loader_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (loader_slot) {
    				if (loader_slot.p && dirty[0] & /*$$scope*/ 268435456) {
    					update_slot(loader_slot, loader_slot_template, ctx, /*$$scope*/ ctx[28], dirty, get_loader_slot_changes_1, get_loader_slot_context_1);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loader_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loader_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (loader_slot) loader_slot.d(detaching);
    		}
    	};
    }

    // (432:2) {#if !loading && visible.length === 0}
    function create_if_block(ctx) {
    	let current;
    	const empty_slot_template = /*#slots*/ ctx[29].empty;
    	const empty_slot = create_slot(empty_slot_template, ctx, /*$$scope*/ ctx[28], get_empty_slot_context);

    	return {
    		c() {
    			if (empty_slot) empty_slot.c();
    		},
    		m(target, anchor) {
    			if (empty_slot) {
    				empty_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (empty_slot) {
    				if (empty_slot.p && dirty[0] & /*$$scope*/ 268435456) {
    					update_slot(empty_slot, empty_slot_template, ctx, /*$$scope*/ ctx[28], dirty, get_empty_slot_changes, get_empty_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(empty_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(empty_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (empty_slot) empty_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let virtual_infinite_list_viewport;
    	let virtual_infinite_list_contents;
    	let current_block_type_index;
    	let if_block0;
    	let t;
    	let virtual_infinite_list_viewport_resize_listener;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*visible*/ ctx[9].length > 0) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = !/*loading*/ ctx[0] && /*visible*/ ctx[9].length === 0 && create_if_block(ctx);

    	return {
    		c() {
    			virtual_infinite_list_viewport = element("virtual-infinite-list-viewport");
    			virtual_infinite_list_contents = element("virtual-infinite-list-contents");
    			if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[7] + "px");
    			set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[8] + "px");
    			set_custom_element_data(virtual_infinite_list_contents, "class", "svelte-1kggtm4");
    			set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[2]);
    			set_custom_element_data(virtual_infinite_list_viewport, "class", "svelte-1kggtm4");
    			add_render_callback(() => /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[32].call(virtual_infinite_list_viewport));
    		},
    		m(target, anchor) {
    			insert(target, virtual_infinite_list_viewport, anchor);
    			append(virtual_infinite_list_viewport, virtual_infinite_list_contents);
    			if_blocks[current_block_type_index].m(virtual_infinite_list_contents, null);
    			/*virtual_infinite_list_contents_binding*/ ctx[30](virtual_infinite_list_contents);
    			append(virtual_infinite_list_viewport, t);
    			if (if_block1) if_block1.m(virtual_infinite_list_viewport, null);
    			/*virtual_infinite_list_viewport_binding*/ ctx[31](virtual_infinite_list_viewport);
    			virtual_infinite_list_viewport_resize_listener = add_resize_listener(virtual_infinite_list_viewport, /*virtual_infinite_list_viewport_elementresize_handler*/ ctx[32].bind(virtual_infinite_list_viewport));
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(window, "resize", /*onResize*/ ctx[11]),
    					listen(virtual_infinite_list_viewport, "scroll", /*onScroll*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				} else {
    					if_block0.p(ctx, dirty);
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(virtual_infinite_list_contents, null);
    			}

    			if (!current || dirty[0] & /*top*/ 128) {
    				set_style(virtual_infinite_list_contents, "padding-top", /*top*/ ctx[7] + "px");
    			}

    			if (!current || dirty[0] & /*bottom*/ 256) {
    				set_style(virtual_infinite_list_contents, "padding-bottom", /*bottom*/ ctx[8] + "px");
    			}

    			if (!/*loading*/ ctx[0] && /*visible*/ ctx[9].length === 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*loading, visible*/ 513) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(virtual_infinite_list_viewport, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*height*/ 4) {
    				set_style(virtual_infinite_list_viewport, "height", /*height*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(virtual_infinite_list_viewport);
    			if_blocks[current_block_type_index].d();
    			/*virtual_infinite_list_contents_binding*/ ctx[30](null);
    			if (if_block1) if_block1.d();
    			/*virtual_infinite_list_viewport_binding*/ ctx[31](null);
    			virtual_infinite_list_viewport_resize_listener();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function getTopOf(element) {
    	return element?.getBoundingClientRect().top ?? 0;
    }

    function getMarginTopOf(element) {
    	if (!element) return 0;
    	const marginTop = getMarginTop(element);
    	if (marginTop > 0) return marginTop;
    	const el = element.firstElementChild;
    	if (!el) return 0;
    	return getMarginTop(el);
    }

    function getMarginTop(element) {
    	const style = getComputedStyle(element);
    	const marginTop = Number(style.marginTop.replace("px", ""));
    	return marginTop;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let newItemsLoaded;
    	let preItemsExisted;
    	let visible;
    	let itemsRemoved;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { items = [] } = $$props;
    	let { loading = false } = $$props;
    	let { direction } = $$props;
    	let { height = "100%" } = $$props;
    	let { itemHeight = undefined } = $$props;
    	let { uniqueKey = undefined } = $$props;
    	let { maxItemCountPerLoad = 0 } = $$props;

    	async function scrollTo(offset) {
    		if (!initialized || !viewport) return;
    		viewport.scrollTo({ left: 0, top: offset });
    		await onScroll();
    		await refresh(items, viewportHeight, itemHeight);
    	}

    	async function scrollToIndex(index) {
    		if (typeof items[index] === "undefined" || !initialized) return false;

    		if (!uniqueKey) {
    			console.warn(`[Virtual Infinite List] You have to set 'uniqueKey' if you use this method.`);
    			return false;
    		}

    		searching = true;
    		const { found, top } = await search(index);

    		if (!found) {
    			searching = false;
    			return false;
    		}

    		viewport.scrollTo({ left: 0, top });
    		await onScroll();
    		await refresh(items, viewportHeight, itemHeight);
    		if (reachedTop() && direction !== "bottom") $$invalidate(4, viewport.scrollTop = 1, viewport);
    		if (reachedBottom() && direction !== "top") $$invalidate(4, viewport.scrollTop -= 1, viewport);
    		searching = false;
    		return true;
    	}

    	async function scrollToTop() {
    		if (!initialized || !viewport) return;
    		viewport.scrollTo({ left: 0, top: 1 });
    		await onScroll();
    		await refresh(items, viewportHeight, itemHeight);
    		viewport.scrollTo({ left: 0, top: 1 });
    	}

    	async function scrollToBottom() {
    		if (!initialized || !viewport) return;
    		viewport.scrollTo({ left: 0, top: viewport.scrollHeight });
    		await onScroll();
    		await refresh(items, viewportHeight, itemHeight);
    		viewport.scrollTo({ left: 0, top: viewport.scrollHeight });
    		if (reachedBottom() && direction !== "top") viewport.scrollTo({ left: 0, top: viewport.scrollTop - 1 });
    	}

    	async function reset() {
    		$$invalidate(25, initialized = false);
    		preItemsExisted = false;
    		$$invalidate(24, preItems = []);
    		$$invalidate(12, items = []);
    		$$invalidate(7, top = 0);
    		$$invalidate(8, bottom = 0);
    		$$invalidate(13, start = 0);
    		$$invalidate(14, end = 0);
    		await tick();
    	}

    	async function forceRefresh() {
    		if (!initialized || !viewport) return;
    		await refresh(items, viewportHeight, itemHeight);
    		await onScroll();
    		await refresh(items, viewportHeight, itemHeight);
    	}

    	let { start = 0 } = $$props;
    	let { end = 0 } = $$props;
    	let heightMap = [];
    	let rows;
    	let viewport;
    	let contents;
    	let viewportHeight = 0;
    	let mounted = false;
    	let top = 0;
    	let bottom = 0;
    	let averageHeight = 0;
    	let preItems = [];
    	let searching = false;
    	let initialized = false;

    	async function onLoadAtTop() {
    		const preTop = getTopOf(getTopRow());
    		await refresh(items, viewportHeight, itemHeight);
    		const currTop = getTopOf(getTopRow());
    		const slotItemMarginTop = getMarginTopOf(getTopRow().firstElementChild);
    		const loaderHeight = preTop - currTop < 0 ? 0 : preTop - currTop;
    		const diff = items.length - preItems.length;

    		if (initialized) {
    			const scrollTop = getScrollTop(rows, viewport, heightMap, diff, loaderHeight, slotItemMarginTop);
    			$$invalidate(4, viewport.scrollTop = scrollTop === 0 ? scrollTop + 5 : scrollTop, viewport);
    		}

    		if (initialized && !preItemsExisted) dispatch("initialize");
    		$$invalidate(24, preItems = items ? [...items] : []);
    	}

    	async function onLoadAtBottom() {
    		await refresh(items, viewportHeight, itemHeight);
    		if (initialized && !preItemsExisted) dispatch("initialize");
    		$$invalidate(24, preItems = items ? [...items] : []);
    	}

    	async function onRemove() {
    		const beforeScrollTop = viewport.scrollTop;
    		await tick();
    		viewport.scrollTo({ left: 0, top: beforeScrollTop });
    		await onScroll();
    		$$invalidate(24, preItems = items ? [...items] : []);
    	}

    	// use when direction = 'top' | 'vertical'
    	function getScrollTop(rows, viewport, heightMap, diff, loaderHeight, slotItemMarginTop) {
    		const previousTopDom = rows[diff]
    		? rows[diff].firstChild
    		: rows[diff - 1] ? rows[diff - 1].firstChild : undefined; // after second time
    		// first time

    		if ((!previousTopDom || maxItemCountPerLoad === 0) && preItemsExisted) {
    			console.warn(`[Virtual Infinite List]
    The number of items exceeds 'maxItemCountPerLoad',
    so the offset after loaded may be significantly shift.`);
    		}

    		const viewportTop = viewport.getBoundingClientRect().top;
    		const topFromTop = viewportTop + loaderHeight + slotItemMarginTop;

    		const scrollTop = previousTopDom
    		? previousTopDom.getBoundingClientRect().top - topFromTop
    		: heightMap.slice(0, diff).reduce((pre, curr) => pre + curr) - topFromTop;

    		return scrollTop;
    	}

    	function getTopRow() {
    		return contents.querySelector("virtual-infinite-list-row");
    	}

    	async function refresh(items, viewportHeight, itemHeight) {
    		const { scrollTop } = viewport;
    		await tick(); // wait until the DOM is up to date
    		let contentHeight = top - scrollTop;
    		let i = start;

    		while (contentHeight < viewportHeight && i < items.length) {
    			let row = rows[i - start];

    			if (!row) {
    				$$invalidate(14, end = i + 1);
    				await tick(); // render the newly visible row
    				row = rows[i - start];
    			}

    			const rowHeight = heightMap[i] = itemHeight || row.offsetHeight;
    			contentHeight += rowHeight;
    			i += 1;
    		}

    		$$invalidate(14, end = i);
    		const remaining = items.length - end;
    		averageHeight = (top + contentHeight) / end;
    		$$invalidate(8, bottom = remaining * averageHeight);
    		heightMap.length = items.length;
    	}

    	async function onScroll() {
    		if (!items) {
    			await tick();
    			return;
    		}

    		const { scrollTop } = viewport;
    		const oldStart = start;

    		for (let v = 0; v < rows.length; v += 1) {
    			heightMap[start + v] = itemHeight || rows[v].offsetHeight;
    		}

    		let i = 0;
    		let y = 0;

    		while (i < items.length) {
    			const rowHeight = heightMap[i] || averageHeight;

    			if (y + rowHeight > scrollTop) {
    				$$invalidate(13, start = i);
    				$$invalidate(7, top = y);
    				break;
    			}

    			y += rowHeight;
    			i += 1;
    		}

    		while (i < items.length) {
    			y += heightMap[i] || averageHeight;
    			i += 1;
    			if (y > scrollTop + viewportHeight) break;
    		}

    		$$invalidate(14, end = i);
    		const remaining = items.length - end;
    		averageHeight = y / end;
    		while (i < items.length) heightMap[i++] = averageHeight;
    		$$invalidate(8, bottom = remaining * averageHeight);

    		// prevent jumping if we scrolled up into unknown territory
    		if (start < oldStart) {
    			await tick();
    			let expectedHeight = 0;
    			let actualHeight = 0;

    			for (let i = start; i < oldStart; i += 1) {
    				if (rows[i - start]) {
    					expectedHeight += heightMap[i];
    					actualHeight += itemHeight || rows[i - start].offsetHeight;
    				}
    			}

    			const d = actualHeight - expectedHeight;
    			viewport.scrollTo(0, scrollTop + d);
    		}
    	} // TODO if we overestimated the space these
    	// rows would occupy we may need to add some

    	// more. maybe we can just call handle_scroll again?
    	async function onResize() {
    		if (!initialized || !viewport) return;
    		await refresh(items, viewportHeight, itemHeight);
    	}

    	function scrollListener() {
    		const loadRequired = reachedTop() && direction !== "bottom" || reachedBottom() && direction !== "top";
    		if (!initialized || loading || searching || !loadRequired || items.length === 0 || preItems.length === 0) return;
    		dispatch("infinite", { on: reachedTop() ? "top" : "bottom" });
    	}

    	function reachedTop() {
    		return viewport.scrollTop === 0;
    	}

    	function reachedBottom() {
    		return viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight;
    	}

    	async function search(index) {
    		let result = getItemTopByIndex(index);
    		if (result.found) return result;
    		viewport.scrollTo({ left: 0, top: 0 });
    		await forceRefresh();
    		const isInBuffer = index < maxItemCountPerLoad + 1;
    		const coef = maxItemCountPerLoad - 1;
    		const to = isInBuffer ? 1 : index - coef;
    		result = getItemTopByIndex(index);
    		if (result.found) return result;
    		const h = heightMap.slice(0, index - 1).reduce((h, curr) => h + curr, 0);
    		viewport.scrollTo({ left: 0, top: h });
    		await forceRefresh();
    		result = getItemTopByIndex(index);
    		if (result.found) return result;

    		if (!isInBuffer) {
    			const h = heightMap.slice(0, to).reduce((h, curr) => h + curr, 0);
    			viewport.scrollTo({ left: 0, top: h });
    			await forceRefresh();
    		}

    		result = getItemTopByIndex(index);
    		return result;
    	}

    	function getItemTopByIndex(index) {
    		const element = contents.querySelector(`#_item_${items[index][uniqueKey]}`);

    		const top = element
    		? viewport.scrollTop + getTopOf(element) - getTopOf(viewport)
    		: 0;

    		return { found: !!element, top };
    	}

    	// trigger initial refresh
    	onMount(() => {
    		rows = contents.getElementsByTagName("virtual-infinite-list-row");
    		$$invalidate(23, mounted = true);
    		viewport.addEventListener("scroll", scrollListener, { passive: true });
    	});

    	onDestroy(() => {
    		viewport.removeEventListener("scroll", scrollListener);
    	});

    	function virtual_infinite_list_contents_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contents = $$value;
    			$$invalidate(5, contents);
    		});
    	}

    	function virtual_infinite_list_viewport_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			viewport = $$value;
    			$$invalidate(4, viewport);
    		});
    	}

    	function virtual_infinite_list_viewport_elementresize_handler() {
    		viewportHeight = this.offsetHeight;
    		$$invalidate(6, viewportHeight);
    	}

    	$$self.$$set = $$props => {
    		if ("items" in $$props) $$invalidate(12, items = $$props.items);
    		if ("loading" in $$props) $$invalidate(0, loading = $$props.loading);
    		if ("direction" in $$props) $$invalidate(1, direction = $$props.direction);
    		if ("height" in $$props) $$invalidate(2, height = $$props.height);
    		if ("itemHeight" in $$props) $$invalidate(15, itemHeight = $$props.itemHeight);
    		if ("uniqueKey" in $$props) $$invalidate(3, uniqueKey = $$props.uniqueKey);
    		if ("maxItemCountPerLoad" in $$props) $$invalidate(16, maxItemCountPerLoad = $$props.maxItemCountPerLoad);
    		if ("start" in $$props) $$invalidate(13, start = $$props.start);
    		if ("end" in $$props) $$invalidate(14, end = $$props.end);
    		if ("$$scope" in $$props) $$invalidate(28, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*initialized, loading, items*/ 33558529) {
    			if (!initialized && !loading && items) $$invalidate(25, initialized = true);
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items, preItems*/ 25169920) {
    			$$invalidate(26, newItemsLoaded = mounted && items && items.length > 0 && items.length - preItems.length > 0);
    		}

    		if ($$self.$$.dirty[0] & /*mounted, preItems*/ 25165824) {
    			preItemsExisted = mounted && preItems.length > 0;
    		}

    		if ($$self.$$.dirty[0] & /*initialized, items, start, end, maxItemCountPerLoad*/ 33648640) {
    			$$invalidate(9, visible = initialized
    			? items.slice(start, end + maxItemCountPerLoad).map((data, i) => ({ index: i + start, data }))
    			: []);
    		}

    		if ($$self.$$.dirty[0] & /*newItemsLoaded, initialized, direction*/ 100663298) {
    			if (newItemsLoaded && initialized) {
    				reachedTop() && direction !== "bottom"
    				? onLoadAtTop()
    				: onLoadAtBottom();
    			}
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items, preItems*/ 25169920) {
    			if (mounted && items && items.length === 0 && preItems.length > 0) reset();
    		}

    		if ($$self.$$.dirty[0] & /*mounted, items, preItems*/ 25169920) {
    			$$invalidate(27, itemsRemoved = mounted && items && items.length > 0 && items.length - preItems.length < 0);
    		}

    		if ($$self.$$.dirty[0] & /*itemsRemoved*/ 134217728) {
    			if (itemsRemoved) onRemove();
    		}
    	};

    	return [
    		loading,
    		direction,
    		height,
    		uniqueKey,
    		viewport,
    		contents,
    		viewportHeight,
    		top,
    		bottom,
    		visible,
    		onScroll,
    		onResize,
    		items,
    		start,
    		end,
    		itemHeight,
    		maxItemCountPerLoad,
    		scrollTo,
    		scrollToIndex,
    		scrollToTop,
    		scrollToBottom,
    		reset,
    		forceRefresh,
    		mounted,
    		preItems,
    		initialized,
    		newItemsLoaded,
    		itemsRemoved,
    		$$scope,
    		slots,
    		virtual_infinite_list_contents_binding,
    		virtual_infinite_list_viewport_binding,
    		virtual_infinite_list_viewport_elementresize_handler
    	];
    }

    class VirtualInfiniteList extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1kggtm4-style")) add_css$1();

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				items: 12,
    				loading: 0,
    				direction: 1,
    				height: 2,
    				itemHeight: 15,
    				uniqueKey: 3,
    				maxItemCountPerLoad: 16,
    				scrollTo: 17,
    				scrollToIndex: 18,
    				scrollToTop: 19,
    				scrollToBottom: 20,
    				reset: 21,
    				forceRefresh: 22,
    				start: 13,
    				end: 14
    			},
    			[-1, -1]
    		);
    	}

    	get scrollTo() {
    		return this.$$.ctx[17];
    	}

    	get scrollToIndex() {
    		return this.$$.ctx[18];
    	}

    	get scrollToTop() {
    		return this.$$.ctx[19];
    	}

    	get scrollToBottom() {
    		return this.$$.ctx[20];
    	}

    	get reset() {
    		return this.$$.ctx[21];
    	}

    	get forceRefresh() {
    		return this.$$.ctx[22];
    	}
    }

    const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    let _count = 0;
    async function find(count) {
      const data = Array.from(new Array(count)).map((_, index) => {
        const animal = animals[Math.floor(Math.random() * animals.length)];
        const name =
          Math.random() < 0.3
            ? Array.from(new Array(10))
                .map((_) => animal)
                .join('')
            : animal;
        return { name, id: 'data' + (_count + index) }
      });

      await sleep(0.3);
      _count = count + _count;
      return data
    }

    const animals = [
      'Aardvark',
      'Albatross',
      'Alligator',
      'Alpaca',
      'Ant',
      'Anteater',
      'Antelope',
      'Ape',
      'Armadillo',
      'Donkey',
      'Baboon',
      'Badger',
      'Barracuda',
      'Bat',
      'Bear',
      'Beaver',
      'Bee',
      'Bison',
      'Boar',
      'Buffalo',
      'Butterfly',
      'Camel',
      'Capybara',
      'Caribou',
      'Cassowary',
      'Cat',
      'Caterpillar',
      'Cattle',
      'Chamois',
      'Cheetah',
      'Chicken',
      'Chimpanzee',
      'Chinchilla',
      'Chough',
      'Clam',
      'Cobra',
      'Cockroach',
      'Cod',
      'Cormorant',
      'Coyote',
      'Crab',
      'Crane',
      'Crocodile',
      'Crow',
      'Curlew',
      'Deer',
      'Dinosaur',
      'Dog',
      'Dogfish',
      'Dolphin',
      'Dotterel',
      'Dove',
      'Dragonfly',
      'Duck',
      'Dugong',
      'Dunlin',
      'Eagle',
      'Echidna',
      'Eel',
      'Eland',
      'Elephant',
      'Elk',
      'Emu',
      'Falcon',
      'Ferret',
      'Finch',
      'Fish',
      'Flamingo',
      'Fly',
      'Fox',
      'Frog',
      'Gaur',
      'Gazelle',
      'Gerbil',
      'Giraffe',
      'Gnat',
      'Gnu',
      'Goat',
      'Goldfinch',
      'Goldfish',
      'Goose',
      'Gorilla',
      'Goshawk',
      'Grasshopper',
      'Grouse',
      'Guanaco',
      'Gull',
      'Hamster',
      'Hare',
      'Hawk',
      'Hedgehog',
      'Heron',
      'Herring',
      'Hippopotamus',
      'Hornet',
      'Horse',
      'Human',
      'Hummingbird',
      'Hyena',
      'Ibex',
      'Ibis',
      'Jackal',
      'Jaguar',
      'Jay',
      'Jellyfish',
      'Kangaroo',
      'Kingfisher',
      'Koala',
      'Kookabura',
      'Kouprey',
      'Kudu',
      'Lapwing',
      'Lark',
      'Lemur',
      'Leopard',
      'Lion',
      'Llama',
      'Lobster',
      'Locust',
      'Loris',
      'Louse',
      'Lyrebird',
      'Magpie',
      'Mallard',
      'Manatee',
      'Mandrill',
      'Mantis',
      'Marten',
      'Meerkat',
      'Mink',
      'Mole',
      'Mongoose',
      'Monkey',
      'Moose',
      'Mosquito',
      'Mouse',
      'Mule',
      'Narwhal',
      'Newt',
      'Nightingale',
      'Octopus',
      'Okapi',
      'Opossum',
      'Oryx',
      'Ostrich',
      'Otter',
      'Owl',
      'Oyster',
      'Panther',
      'Parrot',
      'Partridge',
      'Peafowl',
      'Pelican',
      'Penguin',
      'Pheasant',
      'Pig',
      'Pigeon',
      'Pony',
      'Porcupine',
      'Porpoise',
      'Quail',
      'Quelea',
      'Quetzal',
      'Rabbit',
      'Raccoon',
      'Rail',
      'Ram',
      'Rat',
      'Raven',
      'Red deer',
      'Red panda',
      'Reindeer',
      'Rhinoceros',
      'Rook',
      'Salamander',
      'Salmon',
      'Sand Dollar',
      'Sandpiper',
      'Sardine',
      'Scorpion',
      'Seahorse',
      'Seal',
      'Shark',
      'Sheep',
      'Shrew',
      'Skunk',
      'Snail',
      'Snake',
      'Sparrow',
      'Spider',
      'Spoonbill',
      'Squid',
      'Squirrel',
      'Starling',
      'Stingray',
      'Stinkbug',
      'Stork',
      'Swallow',
      'Swan',
      'Tapir',
      'Tarsier',
      'Termite',
      'Tiger',
      'Toad',
      'Trout',
      'Turkey',
      'Turtle',
      'Viper',
      'Vulture',
      'Wallaby',
      'Walrus',
      'Wasp',
      'Weasel',
      'Whale',
      'Wildcat',
      'Wolf',
      'Wolverine',
      'Wombat',
      'Woodcock',
      'Woodpecker',
      'Worm',
      'Wren',
      'Yak',
      'Zebra',
    ];

    /* __tests__/src/App.svelte generated by Svelte v3.37.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1oj7q8v-style";
    	style.textContent = ".row.svelte-1oj7q8v{margin-top:8px;margin-bottom:8px;overflow-wrap:break-word}.load-count.svelte-1oj7q8v{margin-top:8px;margin-bottom:8px}.direction.svelte-1oj7q8v{margin-top:8px;margin-bottom:8px}main.svelte-1oj7q8v{text-align:center;padding:1em;max-width:240px;margin:0 auto}";
    	append(document.head, style);
    }

    // (104:6) 
    function create_item_slot(ctx) {
    	let div1;
    	let div0;
    	let t_value = /*item*/ ctx[16].name + "";
    	let t;

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			t = text(t_value);
    			attr(div0, "class", "row svelte-1oj7q8v");
    			attr(div1, "slot", "item");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*item*/ 65536 && t_value !== (t_value = /*item*/ ctx[16].name + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let main;
    	let button0;
    	let t1;
    	let div0;
    	let t2;
    	let t3;
    	let t4;
    	let div1;
    	let t5;
    	let t6;
    	let input;
    	let t7;
    	let button1;
    	let t9;
    	let div2;
    	let virtualinfinitelist;
    	let updating_start;
    	let updating_end;
    	let t10;
    	let div3;
    	let t11;
    	let t12;
    	let t13;
    	let current;
    	let mounted;
    	let dispose;

    	function virtualinfinitelist_start_binding(value) {
    		/*virtualinfinitelist_start_binding*/ ctx[14](value);
    	}

    	function virtualinfinitelist_end_binding(value) {
    		/*virtualinfinitelist_end_binding*/ ctx[15](value);
    	}

    	let virtualinfinitelist_props = {
    		height: "500px",
    		direction: /*direction*/ ctx[2],
    		loading: /*loading*/ ctx[1],
    		items: /*items*/ ctx[0],
    		uniqueKey: "id",
    		maxItemCountPerLoad: 30,
    		$$slots: {
    			item: [
    				create_item_slot,
    				({ item }) => ({ 16: item }),
    				({ item }) => item ? 65536 : 0
    			]
    		},
    		$$scope: { ctx }
    	};

    	if (/*start*/ ctx[5] !== void 0) {
    		virtualinfinitelist_props.start = /*start*/ ctx[5];
    	}

    	if (/*end*/ ctx[6] !== void 0) {
    		virtualinfinitelist_props.end = /*end*/ ctx[6];
    	}

    	virtualinfinitelist = new VirtualInfiniteList({ props: virtualinfinitelist_props });
    	/*virtualinfinitelist_binding*/ ctx[13](virtualinfinitelist);
    	binding_callbacks.push(() => bind(virtualinfinitelist, "start", virtualinfinitelist_start_binding));
    	binding_callbacks.push(() => bind(virtualinfinitelist, "end", virtualinfinitelist_end_binding));
    	virtualinfinitelist.$on("initialize", /*onInitialize*/ ctx[9]);
    	virtualinfinitelist.$on("infinite", /*onInfinite*/ ctx[10]);

    	return {
    		c() {
    			main = element("main");
    			button0 = element("button");
    			button0.textContent = "Change Direction";
    			t1 = space();
    			div0 = element("div");
    			t2 = text("Current Direction: ");
    			t3 = text(/*direction*/ ctx[2]);
    			t4 = space();
    			div1 = element("div");
    			t5 = text(/*loadCount*/ ctx[3]);
    			t6 = space();
    			input = element("input");
    			t7 = space();
    			button1 = element("button");
    			button1.textContent = "moveTo";
    			t9 = space();
    			div2 = element("div");
    			create_component(virtualinfinitelist.$$.fragment);
    			t10 = space();
    			div3 = element("div");
    			t11 = text(/*start*/ ctx[5]);
    			t12 = text(" - ");
    			t13 = text(/*end*/ ctx[6]);
    			attr(button0, "id", "direction");
    			attr(div0, "class", "direction svelte-1oj7q8v");
    			attr(div1, "class", "load-count svelte-1oj7q8v");
    			attr(button1, "id", "scrollTo");
    			attr(main, "class", "svelte-1oj7q8v");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, button0);
    			append(main, t1);
    			append(main, div0);
    			append(div0, t2);
    			append(div0, t3);
    			append(main, t4);
    			append(main, div1);
    			append(div1, t5);
    			append(main, t6);
    			append(main, input);
    			set_input_value(input, /*value*/ ctx[7]);
    			append(main, t7);
    			append(main, button1);
    			append(main, t9);
    			append(main, div2);
    			mount_component(virtualinfinitelist, div2, null);
    			append(main, t10);
    			append(main, div3);
    			append(div3, t11);
    			append(div3, t12);
    			append(div3, t13);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*onClick*/ ctx[8]),
    					listen(input, "input", /*input_input_handler*/ ctx[11]),
    					listen(button1, "click", /*click_handler*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*direction*/ 4) set_data(t3, /*direction*/ ctx[2]);
    			if (!current || dirty & /*loadCount*/ 8) set_data(t5, /*loadCount*/ ctx[3]);

    			if (dirty & /*value*/ 128 && input.value !== /*value*/ ctx[7]) {
    				set_input_value(input, /*value*/ ctx[7]);
    			}

    			const virtualinfinitelist_changes = {};
    			if (dirty & /*direction*/ 4) virtualinfinitelist_changes.direction = /*direction*/ ctx[2];
    			if (dirty & /*loading*/ 2) virtualinfinitelist_changes.loading = /*loading*/ ctx[1];
    			if (dirty & /*items*/ 1) virtualinfinitelist_changes.items = /*items*/ ctx[0];

    			if (dirty & /*$$scope, item*/ 196608) {
    				virtualinfinitelist_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_start && dirty & /*start*/ 32) {
    				updating_start = true;
    				virtualinfinitelist_changes.start = /*start*/ ctx[5];
    				add_flush_callback(() => updating_start = false);
    			}

    			if (!updating_end && dirty & /*end*/ 64) {
    				updating_end = true;
    				virtualinfinitelist_changes.end = /*end*/ ctx[6];
    				add_flush_callback(() => updating_end = false);
    			}

    			virtualinfinitelist.$set(virtualinfinitelist_changes);
    			if (!current || dirty & /*start*/ 32) set_data(t11, /*start*/ ctx[5]);
    			if (!current || dirty & /*end*/ 64) set_data(t13, /*end*/ ctx[6]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(virtualinfinitelist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(virtualinfinitelist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			/*virtualinfinitelist_binding*/ ctx[13](null);
    			destroy_component(virtualinfinitelist);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { items = [] } = $$props;
    	let { loading = true } = $$props;
    	let { direction = "top" } = $$props;
    	let loadCount = 0;
    	let virtualInfiniteList;
    	let start;
    	let end;
    	let value;

    	async function onClick() {
    		$$invalidate(1, loading = true);
    		$$invalidate(0, items = []);

    		switch (direction) {
    			case "top":
    				{
    					$$invalidate(2, direction = "bottom");
    					break;
    				}
    			case "bottom":
    				{
    					$$invalidate(2, direction = "vertical");
    					break;
    				}
    			default:
    				{
    					$$invalidate(2, direction = "top");
    				}
    		}

    		const animals = await find(30);
    		$$invalidate(0, items = [...animals]);
    		$$invalidate(1, loading = false);
    		$$invalidate(3, loadCount++, loadCount);
    	}

    	async function onInitialize() {
    		direction === "top" && await virtualInfiniteList.scrollTo(99999);
    		direction === "bottom" && await virtualInfiniteList.scrollTo(0);
    		direction === "vertical" && await virtualInfiniteList.scrollTo(1);
    	}

    	async function onInfinite({ detail }) {
    		$$invalidate(1, loading = true);
    		const animals = await find(30);
    		if (detail.on === "top") $$invalidate(0, items = [...animals, ...items]); else $$invalidate(0, items = [...items, ...animals]);
    		$$invalidate(1, loading = false);
    		$$invalidate(3, loadCount++, loadCount);
    	}

    	onMount(async () => {
    		$$invalidate(1, loading = true);
    		const animals = await find(30);
    		$$invalidate(0, items = [...animals]);
    		$$invalidate(1, loading = false);
    		$$invalidate(3, loadCount++, loadCount);
    	});

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(7, value);
    	}

    	const click_handler = () => virtualInfiniteList.scrollToIndex(Number(value));

    	function virtualinfinitelist_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			virtualInfiniteList = $$value;
    			$$invalidate(4, virtualInfiniteList);
    		});
    	}

    	function virtualinfinitelist_start_binding(value) {
    		start = value;
    		$$invalidate(5, start);
    	}

    	function virtualinfinitelist_end_binding(value) {
    		end = value;
    		$$invalidate(6, end);
    	}

    	$$self.$$set = $$props => {
    		if ("items" in $$props) $$invalidate(0, items = $$props.items);
    		if ("loading" in $$props) $$invalidate(1, loading = $$props.loading);
    		if ("direction" in $$props) $$invalidate(2, direction = $$props.direction);
    	};

    	return [
    		items,
    		loading,
    		direction,
    		loadCount,
    		virtualInfiniteList,
    		start,
    		end,
    		value,
    		onClick,
    		onInitialize,
    		onInfinite,
    		input_input_handler,
    		click_handler,
    		virtualinfinitelist_binding,
    		virtualinfinitelist_start_binding,
    		virtualinfinitelist_end_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1oj7q8v-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, { items: 0, loading: 1, direction: 2 });
    	}
    }

    const app = new App({
      target: document.body,
      props: {
        name: 'world',
      },
    });

    return app;

}());
