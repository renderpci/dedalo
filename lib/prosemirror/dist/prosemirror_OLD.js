!function() {
    "use strict";
    function t(t) {
        this.content = t
    }
    function e(t, n, r) {
        for (var o = 0; ; o++) {
            if (o == t.childCount || o == n.childCount)
                return t.childCount == n.childCount ? null : r;
            var i = t.child(o)
              , s = n.child(o);
            if (i != s) {
                if (!i.sameMarkup(s))
                    return r;
                if (i.isText && i.text != s.text) {
                    for (var a = 0; i.text[a] == s.text[a]; a++)
                        r++;
                    return r
                }
                if (i.content.size || s.content.size) {
                    var c = e(i.content, s.content, r + 1);
                    if (null != c)
                        return c
                }
                r += i.nodeSize
            } else
                r += i.nodeSize
        }
    }
    function n(t, e, r, o) {
        for (var i = t.childCount, s = e.childCount; ; ) {
            if (0 == i || 0 == s)
                return i == s ? null : {
                    a: r,
                    b: o
                };
            var a = t.child(--i)
              , c = e.child(--s)
              , l = a.nodeSize;
            if (a != c) {
                if (!a.sameMarkup(c))
                    return {
                        a: r,
                        b: o
                    };
                if (a.isText && a.text != c.text) {
                    for (var p = 0, u = Math.min(a.text.length, c.text.length); p < u && a.text[a.text.length - p - 1] == c.text[c.text.length - p - 1]; )
                        p++,
                        r--,
                        o--;
                    return {
                        a: r,
                        b: o
                    }
                }
                if (a.content.size || c.content.size) {
                    var h = n(a.content, c.content, r - 1, o - 1);
                    if (h)
                        return h
                }
                r -= l,
                o -= l
            } else
                r -= l,
                o -= l
        }
    }
    function r(t, e) {
        return Uo.index = t,
        Uo.offset = e,
        Uo
    }
    function o(t, e) {
        if (t === e)
            return !0;
        if (!t || "object" != typeof t || !e || "object" != typeof e)
            return !1;
        var n = Array.isArray(t);
        if (Array.isArray(e) != n)
            return !1;
        if (n) {
            if (t.length != e.length)
                return !1;
            for (var r = 0; r < t.length; r++)
                if (!o(t[r], e[r]))
                    return !1
        } else {
            for (var i in t)
                if (!(i in e && o(t[i], e[i])))
                    return !1;
            for (var s in e)
                if (!(s in t))
                    return !1
        }
        return !0
    }
    function i(t) {
        var e = Error.call(this, t);
        return e.__proto__ = i.prototype,
        e
    }
    function s(t, e, n) {
        var r = t.findIndex(e)
          , o = r.index
          , i = r.offset
          , a = t.maybeChild(o)
          , c = t.findIndex(n)
          , l = c.index
          , p = c.offset;
        if (i == e || a.isText) {
            if (p != n && !t.child(l).isText)
                throw new RangeError("Removing non-flat range");
            return t.cut(0, e).append(t.cut(n))
        }
        if (o != l)
            throw new RangeError("Removing non-flat range");
        return t.replaceChild(o, a.copy(s(a.content, e - i - 1, n - i - 1)))
    }
    function a(t, e, n, r) {
        var o = t.findIndex(e)
          , i = o.index
          , s = o.offset
          , c = t.maybeChild(i);
        if (s == e || c.isText)
            return r && !r.canReplace(i, i, n) ? null : t.cut(0, e).append(n).append(t.cut(e));
        var l = a(c.content, e - s - 1, n);
        return l && t.replaceChild(i, c.copy(l))
    }
    function c(t, e, n) {
        if (n.openStart > t.depth)
            throw new i("Inserted content deeper than insertion position");
        if (t.depth - n.openStart != e.depth - n.openEnd)
            throw new i("Inconsistent open depths");
        return l(t, e, n, 0)
    }
    function l(t, e, n, r) {
        var o = t.index(r)
          , i = t.node(r);
        if (o == e.index(r) && r < t.depth - n.openStart) {
            var s = l(t, e, n, r + 1);
            return i.copy(i.content.replaceChild(o, s))
        }
        if (n.content.size) {
            if (n.openStart || n.openEnd || t.depth != r || e.depth != r) {
                var a = g(n, t);
                return d(i, m(t, a.start, a.end, e, r))
            }
            var c = t.parent
              , p = c.content;
            return d(c, p.cut(0, t.parentOffset).append(n.content).append(p.cut(e.parentOffset)))
        }
        return d(i, v(t, e, r))
    }
    function p(t, e) {
        if (!e.type.compatibleContent(t.type))
            throw new i("Cannot join " + e.type.name + " onto " + t.type.name)
    }
    function u(t, e, n) {
        var r = t.node(n);
        return p(r, e.node(n)),
        r
    }
    function h(t, e) {
        var n = e.length - 1;
        n >= 0 && t.isText && t.sameMarkup(e[n]) ? e[n] = t.withText(e[n].text + t.text) : e.push(t)
    }
    function f(t, e, n, r) {
        var o = (e || t).node(n)
          , i = 0
          , s = e ? e.index(n) : o.childCount;
        t && (i = t.index(n),
        t.depth > n ? i++ : t.textOffset && (h(t.nodeAfter, r),
        i++));
        for (var a = i; a < s; a++)
            h(o.child(a), r);
        e && e.depth == n && e.textOffset && h(e.nodeBefore, r)
    }
    function d(t, e) {
        if (!t.type.validContent(e))
            throw new i("Invalid content for node " + t.type.name);
        return t.copy(e)
    }
    function m(t, e, n, r, o) {
        var i = t.depth > o && u(t, e, o + 1)
          , s = r.depth > o && u(n, r, o + 1)
          , a = [];
        return f(null, t, o, a),
        i && s && e.index(o) == n.index(o) ? (p(i, s),
        h(d(i, m(t, e, n, r, o + 1)), a)) : (i && h(d(i, v(t, e, o + 1)), a),
        f(e, n, o, a),
        s && h(d(s, v(n, r, o + 1)), a)),
        f(r, null, o, a),
        new Ko(a)
    }
    function v(t, e, n) {
        var r = [];
        return f(null, t, n, r),
        t.depth > n && h(d(u(t, e, n + 1), v(t, e, n + 1)), r),
        f(e, null, n, r),
        new Ko(r)
    }
    function g(t, e) {
        for (var n = e.depth - t.openStart, r = e.node(n).copy(t.content), o = n - 1; o >= 0; o--)
            r = e.node(o).copy(Ko.from(r));
        return {
            start: r.resolveNoCache(t.openStart + n),
            end: r.resolveNoCache(r.content.size - t.openEnd - n)
        }
    }
    function y(t, e) {
        for (var n = t.length - 1; n >= 0; n--)
            e = t[n].type.name + "(" + e + ")";
        return e
    }
    function w(t) {
        var e = [];
        do {
            e.push(b(t))
        } while (t.eat("|"));return 1 == e.length ? e[0] : {
            type: "choice",
            exprs: e
        }
    }
    function b(t) {
        var e = [];
        do {
            e.push(k(t))
        } while (t.next && ")" != t.next && "|" != t.next);return 1 == e.length ? e[0] : {
            type: "seq",
            exprs: e
        }
    }
    function k(t) {
        for (var e = C(t); ; )
            if (t.eat("+"))
                e = {
                    type: "plus",
                    expr: e
                };
            else if (t.eat("*"))
                e = {
                    type: "star",
                    expr: e
                };
            else if (t.eat("?"))
                e = {
                    type: "opt",
                    expr: e
                };
            else {
                if (!t.eat("{"))
                    break;
                e = S(t, e)
            }
        return e
    }
    function x(t) {
        /\D/.test(t.next) && t.err("Expected number, got '" + t.next + "'");
        var e = Number(t.next);
        return t.pos++,
        e
    }
    function S(t, e) {
        var n = x(t)
          , r = n;
        return t.eat(",") && (r = "}" != t.next ? x(t) : -1),
        t.eat("}") || t.err("Unclosed braced range"),
        {
            type: "range",
            min: n,
            max: r,
            expr: e
        }
    }
    function M(t, e) {
        var n = t.nodeTypes
          , r = n[e];
        if (r)
            return [r];
        var o = [];
        for (var i in n) {
            var s = n[i];
            s.groups.indexOf(e) > -1 && o.push(s)
        }
        return 0 == o.length && t.err("No node type or group '" + e + "' found"),
        o
    }
    function C(t) {
        if (t.eat("(")) {
            var e = w(t);
            return t.eat(")") || t.err("Missing closing paren"),
            e
        }
        if (!/\W/.test(t.next)) {
            var n = M(t, t.next).map(function(e) {
                return null == t.inline ? t.inline = e.isInline : t.inline != e.isInline && t.err("Mixing inline and block content"),
                {
                    type: "name",
                    value: e
                }
            });
            return t.pos++,
            1 == n.length ? n[0] : {
                type: "choice",
                exprs: n
            }
        }
        t.err("Unexpected token '" + t.next + "'")
    }
    function O(t) {
        function e() {
            return i.push([]) - 1
        }
        function n(t, e, n) {
            var r = {
                term: n,
                to: e
            };
            return i[t].push(r),
            r
        }
        function r(t, e) {
            t.forEach(function(t) {
                return t.to = e
            })
        }
        function o(t, i) {
            if ("choice" == t.type)
                return t.exprs.reduce(function(t, e) {
                    return t.concat(o(e, i))
                }, []);
            if ("seq" == t.type)
                for (var s = 0; ; s++) {
                    var a = o(t.exprs[s], i);
                    if (s == t.exprs.length - 1)
                        return a;
                    r(a, i = e())
                }
            else {
                if ("star" == t.type) {
                    var c = e();
                    return n(i, c),
                    r(o(t.expr, c), c),
                    [n(c)]
                }
                if ("plus" == t.type) {
                    var l = e();
                    return r(o(t.expr, i), l),
                    r(o(t.expr, l), l),
                    [n(l)]
                }
                if ("opt" == t.type)
                    return [n(i)].concat(o(t.expr, i));
                if ("range" == t.type) {
                    for (var p = i, u = 0; u < t.min; u++) {
                        var h = e();
                        r(o(t.expr, p), h),
                        p = h
                    }
                    if (-1 == t.max)
                        r(o(t.expr, p), p);
                    else
                        for (var f = t.min; f < t.max; f++) {
                            var d = e();
                            n(p, d),
                            r(o(t.expr, p), d),
                            p = d
                        }
                    return [n(p)]
                }
                if ("name" == t.type)
                    return [n(i, null, t.value)]
            }
        }
        var i = [[]];
        return r(o(t, 0), e()),
        i
    }
    function N(t, e) {
        return e - t
    }
    function T(t, e) {
        function n(e) {
            var o = t[e];
            if (1 == o.length && !o[0].term)
                return n(o[0].to);
            r.push(e);
            for (var i = 0; i < o.length; i++) {
                var s = o[i]
                  , a = s.term
                  , c = s.to;
                a || -1 != r.indexOf(c) || n(c)
            }
        }
        var r = [];
        return n(e),
        r.sort(N)
    }
    function D(t) {
        function e(r) {
            var o = [];
            r.forEach(function(e) {
                t[e].forEach(function(e) {
                    var n = e.term
                      , r = e.to;
                    if (n) {
                        var i = o.indexOf(n)
                          , s = i > -1 && o[i + 1];
                        T(t, r).forEach(function(t) {
                            s || o.push(n, s = []),
                            -1 == s.indexOf(t) && s.push(t)
                        })
                    }
                })
            });
            for (var i = n[r.join(",")] = new li(r.indexOf(t.length - 1) > -1), s = 0; s < o.length; s += 2) {
                var a = o[s + 1].sort(N);
                i.next.push(o[s], n[a.join(",")] || e(a))
            }
            return i
        }
        var n = Object.create(null);
        return e(T(t, 0))
    }
    function E(t, e) {
        for (var n = 0, r = [t]; n < r.length; n++) {
            for (var o = r[n], i = !o.validEnd, s = [], a = 0; a < o.next.length; a += 2) {
                var c = o.next[a]
                  , l = o.next[a + 1];
                s.push(c.name),
                !i || c.isText || c.hasRequiredAttrs() || (i = !1),
                -1 == r.indexOf(l) && r.push(l)
            }
            i && e.err("Only non-generatable nodes (" + s.join(", ") + ") in a required position")
        }
    }
    function A(t) {
        var e = Object.create(null);
        for (var n in t) {
            var r = t[n];
            if (!r.hasDefault)
                return null;
            e[n] = r.default
        }
        return e
    }
    function I(t, e) {
        var n = Object.create(null);
        for (var r in t) {
            var o = e && e[r];
            if (void 0 === o) {
                var i = t[r];
                if (!i.hasDefault)
                    throw new RangeError("No value supplied for attribute " + r);
                o = i.default
            }
            n[r] = o
        }
        return n
    }
    function R(t) {
        var e = Object.create(null);
        if (t)
            for (var n in t)
                e[n] = new mi(t[n]);
        return e
    }
    function z(t, e) {
        for (var n = [], r = 0; r < e.length; r++) {
            var o = e[r]
              , i = t.marks[o]
              , s = i;
            if (i)
                n.push(i);
            else
                for (var a in t.marks) {
                    var c = t.marks[a];
                    ("_" == o || c.spec.group && c.spec.group.split(" ").indexOf(o) > -1) && n.push(s = c)
                }
            if (!s)
                throw new SyntaxError("Unknown mark type: '" + e[r] + "'")
        }
        return n
    }
    function P(t) {
        return (t ? Si : 0) | ("full" === t ? Mi : 0)
    }
    function B(t) {
        for (var e = t.firstChild, n = null; e; e = e.nextSibling) {
            var r = 1 == e.nodeType ? e.nodeName.toLowerCase() : null;
            r && xi.hasOwnProperty(r) && n ? (n.appendChild(e),
            e = n) : "li" == r ? n = e : r && (n = null)
        }
    }
    function V(t, e) {
        return (t.matches || t.msMatchesSelector || t.webkitMatchesSelector || t.mozMatchesSelector).call(t, e)
    }
    function $(t) {
        for (var e, n = /\s*([\w-]+)\s*:\s*([^;]+)/g, r = []; e = n.exec(t); )
            r.push(e[1], e[2].trim());
        return r
    }
    function _(t) {
        var e = {};
        for (var n in t)
            e[n] = t[n];
        return e
    }
    function q(t) {
        var e = {};
        for (var n in t) {
            var r = t[n].spec.toDOM;
            r && (e[n] = r)
        }
        return e
    }
    function F(t) {
        return t.document || window.document
    }
    function L(t, e) {
        return t + e * Ai
    }
    function j(t) {
        return t & Ei
    }
    function J(t) {
        return (t - (t & Ei)) / Ai
    }
    function W(t) {
        var e = Error.call(this, t);
        return e.__proto__ = W.prototype,
        e
    }
    function K() {
        throw new Error("Override me")
    }
    function H(t, e, n) {
        for (var r = t.resolve(e), o = n - e, i = r.depth; o > 0 && i > 0 && r.indexAfter(i) == r.node(i).childCount; )
            i--,
            o--;
        if (o > 0)
            for (var s = r.node(i).maybeChild(r.indexAfter(i)); o > 0; ) {
                if (!s || s.isLeaf)
                    return !0;
                s = s.firstChild,
                o--
            }
        return !1
    }
    function U(t, e, n) {
        return (0 == e || t.canReplace(e, t.childCount)) && (n == t.childCount || t.canReplace(0, n))
    }
    function G(t) {
        for (var e = t.parent.content.cutByIndex(t.startIndex, t.endIndex), n = t.depth; ; --n) {
            var r = t.$from.node(n)
              , o = t.$from.index(n)
              , i = t.$to.indexAfter(n);
            if (n < t.depth && r.canReplace(o, i, e))
                return n;
            if (0 == n || r.type.spec.isolating || !U(r, o, i))
                break
        }
    }
    function Q(t, e, n, r) {
        void 0 === r && (r = t);
        var o = Y(t, e)
          , i = o && Z(r, e);
        return i ? o.map(X).concat({
            type: e,
            attrs: n
        }).concat(i.map(X)) : null
    }
    function X(t) {
        return {
            type: t,
            attrs: null
        }
    }
    function Y(t, e) {
        var n = t.parent
          , r = t.startIndex
          , o = t.endIndex
          , i = n.contentMatchAt(r).findWrapping(e);
        if (!i)
            return null;
        var s = i.length ? i[0] : e;
        return n.canReplaceWith(r, o, s) ? i : null
    }
    function Z(t, e) {
        var n = t.parent
          , r = t.startIndex
          , o = t.endIndex
          , i = n.child(r)
          , s = e.contentMatch.findWrapping(i.type);
        if (!s)
            return null;
        for (var a = (s.length ? s[s.length - 1] : e).contentMatch, c = r; a && c < o; c++)
            a = a.matchType(n.child(c).type);
        return a && a.validEnd ? s : null
    }
    function tt(t, e, n) {
        var r = t.resolve(e)
          , o = r.index();
        return r.parent.canReplaceWith(o, o + 1, n)
    }
    function et(t, e, n, r) {
        void 0 === n && (n = 1);
        var o = t.resolve(e)
          , i = o.depth - n
          , s = r && r[r.length - 1] || o.parent;
        if (i < 0 || o.parent.type.spec.isolating || !o.parent.canReplace(o.index(), o.parent.childCount) || !s.type.validContent(o.parent.content.cutByIndex(o.index(), o.parent.childCount)))
            return !1;
        for (var a = o.depth - 1, c = n - 2; a > i; a--,
        c--) {
            var l = o.node(a)
              , p = o.index(a);
            if (l.type.spec.isolating)
                return !1;
            var u = l.content.cutByIndex(p, l.childCount)
              , h = r && r[c] || l;
            if (h != l && (u = u.replaceChild(0, h.type.create(h.attrs))),
            !l.canReplace(p + 1, l.childCount) || !h.type.validContent(u))
                return !1
        }
        var f = o.indexAfter(i)
          , d = r && r[0];
        return o.node(i).canReplaceWith(f, f, d ? d.type : o.node(i + 1).type)
    }
    function nt(t, e) {
        var n = t.resolve(e)
          , r = n.index();
        return rt(n.nodeBefore, n.nodeAfter) && n.parent.canReplace(r, r + 1)
    }
    function rt(t, e) {
        return t && e && !t.isLeaf && t.canAppend(e)
    }
    function ot(t, e, n) {
        void 0 === n && (n = -1);
        for (var r = t.resolve(e), o = r.depth; ; o--) {
            var i = void 0
              , s = void 0;
            if (o == r.depth ? (i = r.nodeBefore,
            s = r.nodeAfter) : n > 0 ? (i = r.node(o + 1),
            s = r.node(o).maybeChild(r.index(o) + 1)) : (i = r.node(o).maybeChild(r.index(o) - 1),
            s = r.node(o + 1)),
            i && !i.isTextblock && rt(i, s))
                return e;
            if (0 == o)
                break;
            e = n < 0 ? r.before(o) : r.after(o)
        }
    }
    function it(t, e, n) {
        var r = t.resolve(e);
        if (r.parent.canReplaceWith(r.index(), r.index(), n))
            return e;
        if (0 == r.parentOffset)
            for (var o = r.depth - 1; o >= 0; o--) {
                var i = r.index(o);
                if (r.node(o).canReplaceWith(i, i, n))
                    return r.before(o + 1);
                if (i > 0)
                    return null
            }
        if (r.parentOffset == r.parent.content.size)
            for (var s = r.depth - 1; s >= 0; s--) {
                var a = r.indexAfter(s);
                if (r.node(s).canReplaceWith(a, a, n))
                    return r.after(s + 1);
                if (a < r.node(s).childCount)
                    return null
            }
    }
    function st(t, e, n) {
        var r = t.resolve(e);
        if (!n.content.size)
            return e;
        for (var o = n.content, i = 0; i < n.openStart; i++)
            o = o.firstChild.content;
        for (var s = 1; s <= (0 == n.openStart && n.size ? 2 : 1); s++)
            for (var a = r.depth; a >= 0; a--) {
                var c = a == r.depth ? 0 : r.pos <= (r.start(a + 1) + r.end(a + 1)) / 2 ? -1 : 1
                  , l = r.index(a) + (c > 0 ? 1 : 0);
                if (1 == s ? r.node(a).canReplace(l, l, o) : r.node(a).contentMatchAt(l).findWrapping(o.firstChild.type))
                    return 0 == c ? r.pos : c < 0 ? r.before(a + 1) : r.after(a + 1)
            }
        return null
    }
    function at(t, e, n) {
        for (var r = [], o = 0; o < t.childCount; o++) {
            var i = t.child(o);
            i.content.size && (i = i.copy(at(i.content, e, i))),
            i.isInline && (i = e(i, n, o)),
            r.push(i)
        }
        return Ko.fromArray(r)
    }
    function ct(t, e, n, r) {
        if (void 0 === n && (n = e),
        void 0 === r && (r = Qo.empty),
        e == n && !r.size)
            return null;
        var o = t.resolve(e)
          , i = t.resolve(n);
        if (vt(o, i, r))
            return new qi(e,n,r);
        var s = pt(o, wt(o, r))
          , a = mt(o, i, s);
        if (!a)
            return null;
        if (s.size != a.size && gt(o, i, s)) {
            for (var c = i.depth, l = i.after(c); c > 1 && l == i.end(--c); )
                ++l;
            var p = mt(o, t.resolve(l), s);
            if (p)
                return new Fi(e,l,n,i.end(),p,s.size)
        }
        return a.size || e != n ? new qi(e,n,a) : null
    }
    function lt(t, e, n, r) {
        var o = Ko.empty
          , i = 0
          , s = n[e];
        if (t.depth > e) {
            var a = lt(t, e + 1, n, r || s);
            i = a.openEnd + 1,
            o = Ko.from(t.node(e + 1).copy(a.content))
        }
        return s && (o = o.append(s.content),
        i = s.openEnd),
        r && (o = o.append(t.node(e).contentMatchAt(t.indexAfter(e)).fillBefore(Ko.empty, !0)),
        i = 0),
        {
            content: o,
            openEnd: i
        }
    }
    function pt(t, e) {
        var n = lt(t, 0, e, !1)
          , r = n.content
          , o = n.openEnd;
        return new Qo(r,t.depth,o || 0)
    }
    function ut(t, e, n, r, o, i, s) {
        var a, c = t.childCount, l = c - (s > 0 ? 1 : 0), p = i < 0 ? e : n.node(o);
        a = i < 0 ? p.contentMatchAt(l) : 1 == c && s > 0 ? p.contentMatchAt(i ? n.index(o) : n.indexAfter(o)) : p.contentMatchAt(n.indexAfter(o)).matchFragment(t, c > 0 && i ? 1 : 0, l);
        var u = r.node(o);
        if (s > 0 && o < r.depth) {
            var h = u.content.cutByIndex(r.indexAfter(o)).addToStart(t.lastChild)
              , f = a.fillBefore(h, !0);
            if (f && f.size && i > 0 && 1 == c && (f = null),
            f) {
                var d = ut(t.lastChild.content, t.lastChild, n, r, o + 1, 1 == c ? i - 1 : -1, s - 1);
                if (d) {
                    var m = t.lastChild.copy(d);
                    return f.size ? t.cutByIndex(0, c - 1).append(f).addToEnd(m) : t.replaceChild(c - 1, m)
                }
            }
        }
        s > 0 && (a = a.matchType((1 == c && i > 0 ? n.node(o + 1) : t.lastChild).type));
        var v = r.index(o);
        if (v == u.childCount && !u.type.compatibleContent(e.type))
            return null;
        for (var g = a.fillBefore(u.content, !0, v), y = v; g && y < u.content.childCount; y++)
            p.type.allowsMarks(u.content.child(y).marks) || (g = null);
        if (!g)
            return null;
        if (s > 0) {
            var w = ht(t.lastChild, s - 1, n, o + 1, 1 == c ? i - 1 : -1);
            t = t.replaceChild(c - 1, w)
        }
        return t = t.append(g),
        r.depth > o && (t = t.addToEnd(ft(r, o + 1))),
        t
    }
    function ht(t, e, n, r, o) {
        var i, s = t.content, a = s.childCount;
        if (i = o >= 0 ? n.node(r).contentMatchAt(n.indexAfter(r)).matchFragment(s, o > 0 ? 1 : 0, a) : t.contentMatchAt(a),
        e > 0) {
            var c = ht(s.lastChild, e - 1, n, r + 1, 1 == a ? o - 1 : -1);
            s = s.replaceChild(a - 1, c)
        }
        return t.copy(s.append(i.fillBefore(Ko.empty, !0)))
    }
    function ft(t, e) {
        var n = t.node(e)
          , r = n.contentMatchAt(0).fillBefore(n.content, !0, t.index(e));
        return t.depth > e && (r = r.addToEnd(ft(t, e + 1))),
        n.copy(r)
    }
    function dt(t, e, n) {
        for (; e > 0 && n > 0 && 1 == t.childCount; )
            t = t.firstChild.content,
            e--,
            n--;
        return new Qo(t,e,n)
    }
    function mt(t, e, n) {
        var r = ut(n.content, t.node(0), t, e, 0, n.openStart, n.openEnd);
        return r ? dt(r, n.openStart, e.depth) : null
    }
    function vt(t, e, n) {
        return !n.openStart && !n.openEnd && t.start() == e.start() && t.parent.canReplace(t.index(), e.index(), n.content)
    }
    function gt(t, e, n) {
        if (!e.parent.isTextblock)
            return !1;
        var r = n.openEnd ? yt(n.content, n.openEnd) : t.node(t.depth - (n.openStart - n.openEnd));
        if (!r.isTextblock)
            return !1;
        for (var o = e.index(); o < e.parent.childCount; o++)
            if (!r.type.allowsMarks(e.parent.child(o).marks))
                return !1;
        var i;
        return n.openEnd ? i = r.contentMatchAt(r.childCount) : (i = r.contentMatchAt(r.childCount),
        n.size && (i = i.matchFragment(n.content, n.openStart ? 1 : 0))),
        (i = i.matchFragment(e.parent.content, e.index())) && i.validEnd
    }
    function yt(t, e) {
        for (var n = 1; n < e; n++)
            t = t.lastChild.content;
        return t.lastChild
    }
    function wt(t, e) {
        for (var n = new Ji(t), r = 1; e.size && r <= 3; r++) {
            var o = n.placeSlice(e.content, e.openStart, e.openEnd, r);
            3 == r && o != e && o.size && (r = 0),
            e = o
        }
        for (; n.open.length; )
            n.closeNode();
        return n.placed
    }
    function bt(t, e, n) {
        var r = t.content;
        if (e > 1) {
            var o = bt(t.firstChild, e - 1, 1 == t.childCount ? n - 1 : 0);
            r = t.content.replaceChild(0, o)
        }
        var i = t.type.contentMatch.fillBefore(r, 0 == n);
        return t.copy(i.append(r))
    }
    function kt(t, e) {
        var n = t.content;
        if (e > 1) {
            var r = kt(t.lastChild, e - 1);
            n = t.content.replaceChild(t.childCount - 1, r)
        }
        var o = t.contentMatchAt(t.childCount).fillBefore(Ko.empty, !0);
        return t.copy(n.append(o))
    }
    function xt(t, e) {
        return e ? t.replaceChild(t.childCount - 1, kt(t.lastChild, e)) : t
    }
    function St(t, e, n, r, o) {
        if (e < n) {
            var i = t.firstChild;
            t = t.replaceChild(0, i.copy(St(i.content, e + 1, n, r, i)))
        }
        if (e > r) {
            var s = o.contentMatchAt(0)
              , a = s.fillBefore(t).append(t);
            t = a.append(s.matchFragment(a).fillBefore(Ko.empty, !0))
        }
        return t
    }
    function Mt(t, e) {
        for (var n = [], r = Math.min(t.depth, e.depth); r >= 0; r--) {
            var o = t.start(r);
            if (o < t.pos - (t.depth - r) || e.end(r) > e.pos + (e.depth - r) || t.node(r).type.spec.isolating || e.node(r).type.spec.isolating)
                break;
            o == e.start(r) && n.push(r)
        }
        return n
    }
    function Ct(t, e, n, r, o, i) {
        if (e.inlineContent)
            return Qi.create(t, n);
        for (var s = r - (o > 0 ? 0 : 1); o > 0 ? s < e.childCount : s >= 0; s += o) {
            var a = e.child(s);
            if (a.isAtom) {
                if (!i && Yi.isSelectable(a))
                    return Yi.create(t, n - (o < 0 ? a.nodeSize : 0))
            } else {
                var c = Ct(t, a, n + o, o < 0 ? a.childCount : 0, o, i);
                if (c)
                    return c
            }
            n += a.nodeSize * o
        }
    }
    function Ot(t, e, n) {
        var r = t.steps.length - 1;
        if (!(r < e)) {
            var o = t.steps[r];
            if (o instanceof qi || o instanceof Fi) {
                var i;
                t.mapping.maps[r].forEach(function(t, e, n, r) {
                    null == i && (i = r)
                }),
                t.setSelection(Hi.near(t.doc.resolve(i), n))
            }
        }
    }
    function Nt(t, e) {
        return e && t ? t.bind(e) : t
    }
    function Tt(t, e, n) {
        for (var r in t) {
            var o = t[r];
            o instanceof Function ? o = o.bind(e) : "handleDOMEvents" == r && (o = Tt(o, e, {})),
            n[r] = o
        }
        return n
    }
    function Dt(t) {
        return t in us ? t + "$" + ++us[t] : (us[t] = 0,
        t + "$")
    }
    function Et(t, e, n, r, o) {
        for (; ; ) {
            if (t == n && e == r)
                return !0;
            if (e == (o < 0 ? 0 : At(t))) {
                var i = t.parentNode;
                if (1 != i.nodeType || It(t) || Ms.test(t.nodeName) || "false" == t.contentEditable)
                    return !1;
                e = bs(t) + (o < 0 ? 0 : 1),
                t = i
            } else {
                if (1 != t.nodeType)
                    return !1;
                t = t.childNodes[e + (o < 0 ? -1 : 0)],
                e = o < 0 ? At(t) : 0
            }
        }
    }
    function At(t) {
        return 3 == t.nodeType ? t.nodeValue.length : t.childNodes.length
    }
    function It(t) {
        for (var e, n = t; n && !(e = n.pmViewDesc); n = n.parentNode)
            ;
        return e && e.node && e.node.isBlock && (e.dom == t || e.contentDOM == t)
    }
    function Rt(t, e) {
        var n = document.createEvent("Event");
        return n.initEvent("keydown", !0, !0),
        n.keyCode = t,
        n.key = n.code = e,
        n
    }
    function zt(t) {
        return {
            left: 0,
            right: t.innerWidth,
            top: 0,
            bottom: t.innerHeight
        }
    }
    function Pt(t, e) {
        return "number" == typeof t ? t : t[e]
    }
    function Bt(t, e, n) {
        for (var r = t.someProp("scrollThreshold") || 0, o = t.someProp("scrollMargin") || 5, i = t.dom.ownerDocument, s = i.defaultView, a = n || t.dom; a; a = ks(a))
            if (1 == a.nodeType) {
                var c = a == i.body || 1 != a.nodeType
                  , l = c ? zt(s) : a.getBoundingClientRect()
                  , p = 0
                  , u = 0;
                if (e.top < l.top + Pt(r, "top") ? u = -(l.top - e.top + Pt(o, "top")) : e.bottom > l.bottom - Pt(r, "bottom") && (u = e.bottom - l.bottom + Pt(o, "bottom")),
                e.left < l.left + Pt(r, "left") ? p = -(l.left - e.left + Pt(o, "left")) : e.right > l.right - Pt(r, "right") && (p = e.right - l.right + Pt(o, "right")),
                (p || u) && (c ? s.scrollBy(p, u) : (u && (a.scrollTop += u),
                p && (a.scrollLeft += p))),
                c)
                    break
            }
    }
    function Vt(t) {
        for (var e, n, r = t.dom.getBoundingClientRect(), o = Math.max(0, r.top), i = (r.left + r.right) / 2, s = o + 1; s < Math.min(innerHeight, r.bottom); s += 5) {
            var a = t.root.elementFromPoint(i, s);
            if (a != t.dom && t.dom.contains(a)) {
                var c = a.getBoundingClientRect();
                if (c.top >= o - 20) {
                    e = a,
                    n = c.top;
                    break
                }
            }
        }
        return {
            refDOM: e,
            refTop: n,
            stack: $t(t.dom)
        }
    }
    function $t(t) {
        for (var e = [], n = t.ownerDocument; t && (e.push({
            dom: t,
            top: t.scrollTop,
            left: t.scrollLeft
        }),
        t != n); t = ks(t))
            ;
        return e
    }
    function _t(t) {
        var e = t.refDOM
          , n = t.refTop
          , r = t.stack
          , o = e ? e.getBoundingClientRect().top : 0;
        qt(r, 0 == o ? 0 : o - n)
    }
    function qt(t, e) {
        for (var n = 0; n < t.length; n++) {
            var r = t[n]
              , o = r.dom
              , i = r.top
              , s = r.left;
            o.scrollTop != i + e && (o.scrollTop = i + e),
            o.scrollLeft != s && (o.scrollLeft = s)
        }
    }
    function Ft(t) {
        if (t.setActive)
            return t.setActive();
        if (Os)
            return t.focus(Os);
        var e = $t(t);
        t.focus(null == Os ? {
            get preventScroll() {
                return Os = {
                    preventScroll: !0
                },
                !0
            }
        } : void 0),
        Os || (Os = !1,
        qt(e, 0))
    }
    function Lt(t, e) {
        for (var n, r, o = 2e8, i = 0, s = e.top, a = e.top, c = t.firstChild, l = 0; c; c = c.nextSibling,
        l++) {
            var p = void 0;
            if (1 == c.nodeType)
                p = c.getClientRects();
            else {
                if (3 != c.nodeType)
                    continue;
                p = xs(c).getClientRects()
            }
            for (var u = 0; u < p.length; u++) {
                var h = p[u];
                if (h.top <= s && h.bottom >= a) {
                    s = Math.max(h.bottom, s),
                    a = Math.min(h.top, a);
                    var f = h.left > e.left ? h.left - e.left : h.right < e.left ? e.left - h.right : 0;
                    if (f < o) {
                        n = c,
                        o = f,
                        r = f && 3 == n.nodeType ? {
                            left: h.right < e.left ? h.right : h.left,
                            top: e.top
                        } : e,
                        1 == c.nodeType && f && (i = l + (e.left >= (h.left + h.right) / 2 ? 1 : 0));
                        continue
                    }
                }
                !n && (e.left >= h.right && e.top >= h.top || e.left >= h.left && e.top >= h.bottom) && (i = l + 1)
            }
        }
        return n && 3 == n.nodeType ? jt(n, r) : !n || o && 1 == n.nodeType ? {
            node: t,
            offset: i
        } : Lt(n, r)
    }
    function jt(t, e) {
        for (var n = t.nodeValue.length, r = document.createRange(), o = 0; o < n; o++) {
            r.setEnd(t, o + 1),
            r.setStart(t, o);
            var i = Qt(r, 1);
            if (i.top != i.bottom && Jt(e, i))
                return {
                    node: t,
                    offset: o + (e.left >= (i.left + i.right) / 2 ? 1 : 0)
                }
        }
        return {
            node: t,
            offset: 0
        }
    }
    function Jt(t, e) {
        return t.left >= e.left - 1 && t.left <= e.right + 1 && t.top >= e.top - 1 && t.top <= e.bottom + 1
    }
    function Wt(t, e) {
        var n = t.parentNode;
        return n && /^li$/i.test(n.nodeName) && e.left < t.getBoundingClientRect().left ? n : t
    }
    function Kt(t, e, n) {
        var r = Lt(e, n)
          , o = r.node
          , i = r.offset
          , s = -1;
        if (1 == o.nodeType && !o.firstChild) {
            var a = o.getBoundingClientRect();
            s = a.left != a.right && n.left > (a.left + a.right) / 2 ? 1 : -1
        }
        return t.docView.posFromDOM(o, i, s)
    }
    function Ht(t, e, n, r) {
        for (var o = -1, i = e; i != t.dom; ) {
            var s = t.docView.nearestDesc(i, !0);
            if (!s)
                return null;
            if (s.node.isBlock && s.parent) {
                var a = s.dom.getBoundingClientRect();
                if (a.left > r.left || a.top > r.top)
                    o = s.posBefore;
                else {
                    if (!(a.right < r.left || a.bottom < r.top))
                        break;
                    o = s.posAfter
                }
            }
            i = s.dom.parentNode
        }
        return o > -1 ? o : t.docView.posFromDOM(e, n)
    }
    function Ut(t, e, n) {
        var r = t.childNodes.length;
        if (r && n.top < n.bottom)
            for (var o = Math.max(0, Math.min(r - 1, Math.floor(r * (e.top - n.top) / (n.bottom - n.top)) - 2)), i = o; ; ) {
                var s = t.childNodes[i];
                if (1 == s.nodeType)
                    for (var a = s.getClientRects(), c = 0; c < a.length; c++) {
                        var l = a[c];
                        if (Jt(e, l))
                            return Ut(s, e, l)
                    }
                if ((i = (i + 1) % r) == o)
                    break
            }
        return t
    }
    function Gt(t, e) {
        var n, r, o, i, s = t.root;
        if (s.caretPositionFromPoint)
            try {
                var a = s.caretPositionFromPoint(e.left, e.top);
                a && (o = (n = a).offsetNode,
                i = n.offset)
            } catch (t) {}
        if (!o && s.caretRangeFromPoint) {
            var c = s.caretRangeFromPoint(e.left, e.top);
            c && (o = (r = c).startContainer,
            i = r.startOffset)
        }
        var l, p = s.elementFromPoint(e.left, e.top + 1);
        if (!p || !t.dom.contains(1 != p.nodeType ? p.parentNode : p)) {
            var u = t.dom.getBoundingClientRect();
            if (!Jt(e, u))
                return null;
            if (!(p = Ut(t.dom, e, u)))
                return null
        }
        if (p = Wt(p, e),
        o) {
            if (ds.gecko && 1 == o.nodeType && (i = Math.min(i, o.childNodes.length)) < o.childNodes.length) {
                var h, f = o.childNodes[i];
                "IMG" == f.nodeName && (h = f.getBoundingClientRect()).right <= e.left && h.bottom > e.top && i++
            }
            o == t.dom && i == o.childNodes.length - 1 && 1 == o.lastChild.nodeType && e.top > o.lastChild.getBoundingClientRect().bottom ? l = t.state.doc.content.size : 0 != i && 1 == o.nodeType && "BR" == o.childNodes[i - 1].nodeName || (l = Ht(t, o, i, e))
        }
        null == l && (l = Kt(t, p, e));
        var d = t.docView.nearestDesc(p, !0);
        return {
            pos: l,
            inside: d ? d.posAtStart - d.border : -1
        }
    }
    function Qt(t, e) {
        var n = t.getClientRects();
        return n.length ? n[e < 0 ? 0 : n.length - 1] : t.getBoundingClientRect()
    }
    function Xt(t, e) {
        var n = t.docView.domFromPos(e)
          , r = n.node
          , o = n.offset;
        if (3 == r.nodeType && (ds.chrome || ds.gecko)) {
            var i = Qt(xs(r, o, o), 0);
            if (ds.gecko && o && /\s/.test(r.nodeValue[o - 1]) && o < r.nodeValue.length) {
                var s = Qt(xs(r, o - 1, o - 1), -1);
                if (Math.abs(s.left - i.left) < 1 && s.top == i.top) {
                    var a = Qt(xs(r, o, o + 1), -1);
                    return Yt(a, a.left < s.left)
                }
            }
            return i
        }
        if (1 == r.nodeType && !t.state.doc.resolve(e).parent.inlineContent) {
            var c, l = !0;
            if (o < r.childNodes.length) {
                var p = r.childNodes[o];
                1 == p.nodeType && (c = p.getBoundingClientRect())
            }
            if (!c && o) {
                var u = r.childNodes[o - 1];
                1 == u.nodeType && (c = u.getBoundingClientRect(),
                l = !1)
            }
            return Zt(c || r.getBoundingClientRect(), l)
        }
        for (var h = -1; h < 2; h += 2)
            if (h < 0 && o) {
                var f = void 0
                  , d = 3 == r.nodeType ? xs(r, o - 1, o) : 3 == (f = r.childNodes[o - 1]).nodeType ? xs(f) : 1 == f.nodeType && "BR" != f.nodeName ? f : null;
                if (d) {
                    var m = Qt(d, 1);
                    if (m.top < m.bottom)
                        return Yt(m, !1)
                }
            } else if (h > 0 && o < At(r)) {
                var v = void 0
                  , g = 3 == r.nodeType ? xs(r, o, o + 1) : 3 == (v = r.childNodes[o]).nodeType ? xs(v) : 1 == v.nodeType ? v : null;
                if (g) {
                    var y = Qt(g, -1);
                    if (y.top < y.bottom)
                        return Yt(y, !0)
                }
            }
        return Yt(Qt(3 == r.nodeType ? xs(r) : r, 0), !1)
    }
    function Yt(t, e) {
        if (0 == t.width)
            return t;
        var n = e ? t.left : t.right;
        return {
            top: t.top,
            bottom: t.bottom,
            left: n,
            right: n
        }
    }
    function Zt(t, e) {
        if (0 == t.height)
            return t;
        var n = e ? t.top : t.bottom;
        return {
            top: n,
            bottom: n,
            left: t.left,
            right: t.right
        }
    }
    function te(t, e, n) {
        var r = t.state
          , o = t.root.activeElement;
        r != e && t.updateState(e),
        o != t.dom && t.focus();
        try {
            return n()
        } finally {
            r != e && t.updateState(r),
            o != t.dom && o.focus()
        }
    }
    function ee(t, e, n) {
        var r = e.selection
          , o = "up" == n ? r.$anchor.min(r.$head) : r.$anchor.max(r.$head);
        return te(t, e, function() {
            for (var e = t.docView.domFromPos(o.pos).node; ; ) {
                var r = t.docView.nearestDesc(e, !0);
                if (!r)
                    break;
                if (r.node.isBlock) {
                    e = r.dom;
                    break
                }
                e = r.dom.parentNode
            }
            for (var i = Xt(t, o.pos), s = e.firstChild; s; s = s.nextSibling) {
                var a = void 0;
                if (1 == s.nodeType)
                    a = s.getClientRects();
                else {
                    if (3 != s.nodeType)
                        continue;
                    a = xs(s, 0, s.nodeValue.length).getClientRects()
                }
                for (var c = 0; c < a.length; c++) {
                    var l = a[c];
                    if (l.bottom > l.top && ("up" == n ? l.bottom < i.top + 1 : l.top > i.bottom - 1))
                        return !1
                }
            }
            return !0
        })
    }
    function ne(t, e, n) {
        var r = e.selection.$head;
        if (!r.parent.isTextblock)
            return !1;
        var o = r.parentOffset
          , i = !o
          , s = o == r.parent.content.size
          , a = getSelection();
        return Ns.test(r.parent.textContent) && a.modify ? te(t, e, function() {
            var e = a.getRangeAt(0)
              , o = a.focusNode
              , i = a.focusOffset
              , s = a.caretBidiLevel;
            a.modify("move", n, "character");
            var c = !(r.depth ? t.docView.domAfterPos(r.before()) : t.dom).contains(1 == a.focusNode.nodeType ? a.focusNode : a.focusNode.parentNode) || o == a.focusNode && i == a.focusOffset;
            return a.removeAllRanges(),
            a.addRange(e),
            null != s && (a.caretBidiLevel = s),
            c
        }) : "left" == n || "backward" == n ? i : s
    }
    function re(t, e, n) {
        return Ts == e && Ds == n ? Es : (Ts = e,
        Ds = n,
        Es = "up" == n || "down" == n ? ee(t, e, n) : ne(t, e, n))
    }
    function oe(t, e, n, r, o) {
        return pe(r, e, t),
        new Vs(null,t,e,n,r,r,r,o,0)
    }
    function ie(t, e) {
        for (var n = t.firstChild, r = 0; r < e.length; r++) {
            var o = e[r]
              , i = o.dom;
            if (i.parentNode == t) {
                for (; i != n; )
                    n = he(n);
                n = n.nextSibling
            } else
                t.insertBefore(i, n);
            if (o instanceof Bs) {
                var s = n ? n.previousSibling : t.lastChild;
                ie(o.contentDOM, o.children),
                n = s ? s.nextSibling : t.firstChild
            }
        }
        for (; n; )
            n = he(n)
    }
    function se(t) {
        t && (this.nodeName = t)
    }
    function ae(t, e, n) {
        if (0 == t.length)
            return Fs;
        for (var r = n ? Fs[0] : new se, o = [r], i = 0; i < t.length; i++) {
            var s = t[i].type.attrs
              , a = r;
            if (s) {
                s.nodeName && o.push(a = new se(s.nodeName));
                for (var c in s) {
                    var l = s[c];
                    null != l && (n && 1 == o.length && o.push(a = r = new se(e.isInline ? "span" : "div")),
                    "class" == c ? a.class = (a.class ? a.class + " " : "") + l : "style" == c ? a.style = (a.style ? a.style + ";" : "") + l : "nodeName" != c && (a[c] = l))
                }
            }
        }
        return o
    }
    function ce(t, e, n, r) {
        if (n == Fs && r == Fs)
            return e;
        for (var o = e, i = 0; i < r.length; i++) {
            var s = r[i]
              , a = n[i];
            if (i) {
                var c = void 0;
                a && a.nodeName == s.nodeName && o != t && (c = o.parentNode) && c.tagName.toLowerCase() == s.nodeName ? o = c : ((c = document.createElement(s.nodeName)).appendChild(o),
                a = Fs[0],
                o = c)
            }
            le(o, a || Fs[0], s)
        }
        return o
    }
    function le(t, e, n) {
        for (var r in e)
            "class" == r || "style" == r || "nodeName" == r || r in n || t.removeAttribute(r);
        for (var o in n)
            "class" != o && "style" != o && "nodeName" != o && n[o] != e[o] && t.setAttribute(o, n[o]);
        if (e.class != n.class) {
            for (var i = e.class ? e.class.split(" ") : Rs, s = n.class ? n.class.split(" ") : Rs, a = 0; a < i.length; a++)
                -1 == s.indexOf(i[a]) && t.classList.remove(i[a]);
            for (var c = 0; c < s.length; c++)
                -1 == i.indexOf(s[c]) && t.classList.add(s[c])
        }
        if (e.style != n.style) {
            if (e.style)
                for (var l, p = /\s*([\w\-\xa1-\uffff]+)\s*:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\(.*?\)|[^;])*/g; l = p.exec(e.style); )
                    t.style.removeProperty(l[1]);
            n.style && (t.style.cssText += n.style)
        }
    }
    function pe(t, e, n) {
        return ce(t, t, Fs, ae(e, n, 1 != t.nodeType))
    }
    function ue(t, e) {
        if (t.length != e.length)
            return !1;
        for (var n = 0; n < t.length; n++)
            if (!t[n].type.eq(e[n].type))
                return !1;
        return !0
    }
    function he(t) {
        var e = t.nextSibling;
        return t.parentNode.removeChild(t),
        e
    }
    function fe(t, e) {
        for (var n = [], r = t.childCount, o = e.length - 1; r > 0 && o >= 0; o--) {
            var i = e[o]
              , s = i.node;
            if (s) {
                if (s != t.child(r - 1))
                    break;
                n.push(i),
                --r
            }
        }
        return {
            nodes: n.reverse(),
            offset: r
        }
    }
    function de(t, e) {
        return t.type.side - e.type.side
    }
    function me(t, e, n, r) {
        var o = e.locals(t)
          , i = 0;
        if (0 != o.length)
            for (var s = 0, a = [], c = null, l = 0; ; ) {
                if (s < o.length && o[s].to == i) {
                    for (var p = o[s++], u = void 0; s < o.length && o[s].to == i; )
                        (u || (u = [p])).push(o[s++]);
                    if (u) {
                        u.sort(de);
                        for (var h = 0; h < u.length; h++)
                            n(u[h], l)
                    } else
                        n(p, l)
                }
                var f = void 0
                  , d = void 0;
                if (c)
                    d = -1,
                    f = c,
                    c = null;
                else {
                    if (!(l < t.childCount))
                        break;
                    d = l,
                    f = t.child(l++)
                }
                for (var m = 0; m < a.length; m++)
                    a[m].to <= i && a.splice(m--, 1);
                for (; s < o.length && o[s].from == i; )
                    a.push(o[s++]);
                var v = i + f.nodeSize;
                if (f.isText) {
                    var g = v;
                    s < o.length && o[s].from < g && (g = o[s].from);
                    for (var y = 0; y < a.length; y++)
                        a[y].to < g && (g = a[y].to);
                    g < v && (c = f.cut(g - i),
                    f = f.cut(0, g - i),
                    v = g,
                    d = -1)
                }
                r(f, a.length ? a.slice() : Rs, e.forChild(i, f), d),
                i = v
            }
        else
            for (var w = 0; w < t.childCount; w++) {
                var b = t.child(w);
                r(b, o, e.forChild(i, b), w),
                i += b.nodeSize
            }
    }
    function ve(t) {
        if ("UL" == t.nodeName || "OL" == t.nodeName) {
            var e = t.style.cssText;
            t.style.cssText = e + "; list-style: square !important",
            window.getComputedStyle(t).listStyle,
            t.style.cssText = e
        }
    }
    function ge(t, e) {
        for (; ; ) {
            if (3 == t.nodeType)
                return t;
            if (1 == t.nodeType && e > 0) {
                if (t.childNodes.length > e && 3 == t.childNodes[e].nodeType)
                    return t.childNodes[e];
                e = At(t = t.childNodes[e - 1])
            } else {
                if (!(1 == t.nodeType && e < t.childNodes.length))
                    return null;
                t = t.childNodes[e],
                e = 0
            }
        }
    }
    function ye(t, e, n, r) {
        for (var o = "", i = 0, s = 0; i < t.childCount; i++) {
            var a = t.child(i)
              , c = s + a.nodeSize;
            if (a.isText) {
                if (o += a.text,
                c >= r) {
                    for (var l = c - o.length, p = o.lastIndexOf(e); p > -1 && l + p > n; )
                        p = o.lastIndexOf(e, p - 1);
                    if (p > -1 && l + p + e.length >= r)
                        return l + p;
                    if (c > r)
                        break
                }
            } else
                o = "";
            s = c
        }
        return -1
    }
    function we(t, e, n, r, o) {
        for (var i = [], s = 0, a = 0; s < t.length; s++) {
            var c = t[s]
              , l = a
              , p = a += c.size;
            l >= n || p <= e ? i.push(c) : (l < e && i.push(c.slice(0, e - l, r)),
            o && (i.push(o),
            o = null),
            p > n && i.push(c.slice(n - l, c.size, r)))
        }
        return i
    }
    function be(t, e) {
        var n = t.selection
          , r = n.$anchor
          , o = n.$head
          , i = e > 0 ? r.max(o) : r.min(o)
          , s = i.parent.inlineContent ? i.depth ? t.doc.resolve(e > 0 ? i.after() : i.before()) : null : i;
        return s && Hi.findFrom(s, e)
    }
    function ke(t, e) {
        return t.dispatch(t.state.tr.setSelection(e).scrollIntoView()),
        !0
    }
    function xe(t, e, n) {
        var r = t.state.selection;
        if (r instanceof Qi) {
            if (!r.empty || n.indexOf("s") > -1)
                return !1;
            if (t.endOfTextblock(e > 0 ? "right" : "left")) {
                var o = be(t.state, e);
                return !!(o && o instanceof Yi) && ke(t, o)
            }
            var i, s = r.$head, a = s.textOffset ? null : e < 0 ? s.nodeBefore : s.nodeAfter;
            if (!a || a.isText)
                return !1;
            var c = e < 0 ? s.pos - a.nodeSize : s.pos;
            return !!(a.isAtom || (i = t.docView.descAt(c)) && !i.contentDOM) && (Yi.isSelectable(a) ? ke(t, new Yi(e < 0 ? t.state.doc.resolve(s.pos - a.nodeSize) : s)) : !!ds.webkit && ke(t, new Qi(t.state.doc.resolve(e < 0 ? c : c + a.nodeSize))))
        }
        if (r instanceof Yi && r.node.isInline)
            return ke(t, new Qi(e > 0 ? r.$to : r.$from));
        var l = be(t.state, e);
        return !!l && ke(t, l)
    }
    function Se(t) {
        return 3 == t.nodeType ? t.nodeValue.length : t.childNodes.length
    }
    function Me(t) {
        var e = t.pmViewDesc;
        return e && 0 == e.size && (t.nextSibling || "BR" != t.nodeName)
    }
    function Ce(t) {
        var e = t.root.getSelection()
          , n = e.focusNode
          , r = e.focusOffset;
        if (n) {
            var o, i, s = !1;
            for (ds.gecko && 1 == n.nodeType && r < Se(n) && Me(n.childNodes[r]) && (s = !0); ; )
                if (r > 0) {
                    if (1 != n.nodeType)
                        break;
                    var a = n.childNodes[r - 1];
                    if (Me(a))
                        o = n,
                        i = --r;
                    else {
                        if (3 != a.nodeType)
                            break;
                        r = (n = a).nodeValue.length
                    }
                } else {
                    if (Ne(n))
                        break;
                    for (var c = n.previousSibling; c && Me(c); )
                        o = n.parentNode,
                        i = bs(c),
                        c = c.previousSibling;
                    if (c)
                        r = Se(n = c);
                    else {
                        if ((n = n.parentNode) == t.dom)
                            break;
                        r = 0
                    }
                }
            s ? Te(t, e, n, r) : o && Te(t, e, o, i)
        }
    }
    function Oe(t) {
        var e = t.root.getSelection()
          , n = e.focusNode
          , r = e.focusOffset;
        if (n) {
            for (var o, i, s = Se(n); ; )
                if (r < s) {
                    if (1 != n.nodeType)
                        break;
                    if (!Me(n.childNodes[r]))
                        break;
                    o = n,
                    i = ++r
                } else {
                    if (Ne(n))
                        break;
                    for (var a = n.nextSibling; a && Me(a); )
                        o = a.parentNode,
                        i = bs(a) + 1,
                        a = a.nextSibling;
                    if (a)
                        r = 0,
                        s = Se(n = a);
                    else {
                        if ((n = n.parentNode) == t.dom)
                            break;
                        r = s = 0
                    }
                }
            o && Te(t, e, o, i)
        }
    }
    function Ne(t) {
        var e = t.pmViewDesc;
        return e && e.node && e.node.isBlock
    }
    function Te(t, e, n, r) {
        if (Cs(e)) {
            var o = document.createRange();
            o.setEnd(n, r),
            o.setStart(n, r),
            e.removeAllRanges(),
            e.addRange(o)
        } else
            e.extend && e.extend(n, r);
        t.domObserver.setCurSelection()
    }
    function De(t, e, n) {
        var r = t.state.selection;
        if (r instanceof Qi && !r.empty || n.indexOf("s") > -1)
            return !1;
        var o = r.$from
          , i = r.$to;
        if (!o.parent.inlineContent || t.endOfTextblock(e < 0 ? "up" : "down")) {
            var s = be(t.state, e);
            if (s && s instanceof Yi)
                return ke(t, s)
        }
        if (!o.parent.inlineContent) {
            var a = Hi.findFrom(e < 0 ? o : i, e);
            return !a || ke(t, a)
        }
        return !1
    }
    function Ee(t, e) {
        if (!(t.state.selection instanceof Qi))
            return !0;
        var n = t.state.selection
          , r = n.$head
          , o = n.$anchor
          , i = n.empty;
        if (!r.sameParent(o))
            return !0;
        if (!i)
            return !1;
        if (t.endOfTextblock(e > 0 ? "forward" : "backward"))
            return !0;
        var s = !r.textOffset && (e < 0 ? r.nodeBefore : r.nodeAfter);
        if (s && !s.isText) {
            var a = t.state.tr;
            return e < 0 ? a.delete(r.pos - s.nodeSize, r.pos) : a.delete(r.pos, r.pos + s.nodeSize),
            t.dispatch(a),
            !0
        }
        return !1
    }
    function Ae(t, e, n) {
        t.domObserver.stop(),
        e.contentEditable = n,
        t.domObserver.start()
    }
    function Ie(t) {
        if (ds.chrome && !(t.state.selection.$head.parentOffset > 0)) {
            var e = t.root.getSelection()
              , n = e.focusNode
              , r = e.focusOffset;
            if (n && 1 == n.nodeType && 0 == r && n.firstChild && "false" == n.firstChild.contentEditable) {
                var o = n.firstChild;
                Ae(t, o, !0),
                setTimeout(function() {
                    return Ae(t, o, !1)
                }, 20)
            }
        }
    }
    function Re(t) {
        var e = "";
        return t.ctrlKey && (e += "c"),
        t.metaKey && (e += "m"),
        t.altKey && (e += "a"),
        t.shiftKey && (e += "s"),
        e
    }
    function ze(t, e) {
        var n = e.keyCode
          , r = Re(e);
        return 8 == n || ds.mac && 72 == n && "c" == r ? Ee(t, -1) || Ce(t) : 46 == n || ds.mac && 68 == n && "c" == r ? Ee(t, 1) || Oe(t) : 13 == n || 27 == n || (37 == n ? xe(t, -1, r) || Ce(t) : 39 == n ? xe(t, 1, r) || Oe(t) : 38 == n ? De(t, -1, r) || Ce(t) : 40 == n ? Ie(t) || De(t, 1, r) || Oe(t) : r == (ds.mac ? "m" : "c") && (66 == n || 73 == n || 89 == n || 90 == n))
    }
    function Pe(t, e) {
        var n, r, o = t.root.getSelection(), i = t.state.doc, s = t.docView.nearestDesc(o.focusNode), a = s && 0 == s.size, c = t.docView.posFromDOM(o.focusNode, o.focusOffset), l = i.resolve(c);
        if (Cs(o)) {
            for (n = l; s && !s.node; )
                s = s.parent;
            if (s && s.node.isAtom && Yi.isSelectable(s.node) && s.parent) {
                var p = s.posBefore;
                r = new Yi(c == p ? l : i.resolve(p))
            }
        } else
            n = i.resolve(t.docView.posFromDOM(o.anchorNode, o.anchorOffset));
        return r || (r = Le(t, n, l, "pointer" == e || t.state.selection.head < l.pos && !a ? 1 : -1)),
        r
    }
    function Be(t, e) {
        var n = t.state.selection;
        if (qe(t, n),
        t.editable ? t.hasFocus() : Je(t) && document.activeElement.contains(t.dom)) {
            if (t.domObserver.disconnectSelection(),
            t.cursorWrapper)
                _e(t);
            else {
                var r, o, i = n.anchor, s = n.head;
                !js || n instanceof Qi || (n.$from.parent.inlineContent || (r = Ve(t, n.from)),
                n.empty || n.$from.parent.inlineContent || (o = Ve(t, n.to))),
                t.docView.setSelection(i, s, t.root, e),
                js && (r && (r.contentEditable = "false"),
                o && (o.contentEditable = "false")),
                n.visible ? t.dom.classList.remove("ProseMirror-hideselection") : i != s && (t.dom.classList.add("ProseMirror-hideselection"),
                "onselectionchange"in document && $e(t))
            }
            t.domObserver.setCurSelection(),
            t.domObserver.connectSelection()
        }
    }
    function Ve(t, e) {
        var n = t.docView.domFromPos(e)
          , r = n.node
          , o = n.offset
          , i = o < r.childNodes.length ? r.childNodes[o] : null
          , s = o ? r.childNodes[o - 1] : null;
        if (!(i && "false" != i.contentEditable || s && "false" != s.contentEditable)) {
            if (i)
                return i.contentEditable = "true",
                i;
            if (s)
                return s.contentEditable = "true",
                s
        }
    }
    function $e(t) {
        var e = t.dom.ownerDocument;
        e.removeEventListener("selectionchange", t.hideSelectionGuard);
        var n = t.root.getSelection()
          , r = n.anchorNode
          , o = n.anchorOffset;
        e.addEventListener("selectionchange", t.hideSelectionGuard = function() {
            n.anchorNode == r && n.anchorOffset == o || (e.removeEventListener("selectionchange", t.hideSelectionGuard),
            t.dom.classList.remove("ProseMirror-hideselection"))
        }
        )
    }
    function _e(t) {
        var e = t.root.getSelection()
          , n = document.createRange()
          , r = t.cursorWrapper.dom
          , o = "IMG" == r.nodeName;
        o ? n.setEnd(r.parentNode, bs(r) + 1) : n.setEnd(r, 0),
        n.collapse(!1),
        e.removeAllRanges(),
        e.addRange(n),
        !o && !t.state.selection.visible && ds.ie && ds.ie_version <= 11 && (r.disabled = !0,
        r.disabled = !1)
    }
    function qe(t, e) {
        if (e instanceof Yi) {
            var n = t.docView.descAt(e.from);
            n != t.lastSelectedViewDesc && (Fe(t),
            n && n.selectNode(),
            t.lastSelectedViewDesc = n)
        } else
            Fe(t)
    }
    function Fe(t) {
        t.lastSelectedViewDesc && (t.lastSelectedViewDesc.parent && t.lastSelectedViewDesc.deselectNode(),
        t.lastSelectedViewDesc = null)
    }
    function Le(t, e, n, r) {
        return t.someProp("createSelectionBetween", function(r) {
            return r(t, e, n)
        }) || Qi.between(e, n, r)
    }
    function je(t) {
        return (!t.editable || t.root.activeElement == t.dom) && Je(t)
    }
    function Je(t) {
        var e = t.root.getSelection();
        if (!e.anchorNode)
            return !1;
        try {
            return t.dom.contains(3 == e.anchorNode.nodeType ? e.anchorNode.parentNode : e.anchorNode) && (t.editable || t.dom.contains(3 == e.focusNode.nodeType ? e.focusNode.parentNode : e.focusNode))
        } catch (t) {
            return !1
        }
    }
    function We(t) {
        var e = t.docView.domFromPos(t.state.selection.anchor)
          , n = t.root.getSelection();
        return Ss(e.node, e.offset, n.anchorNode, n.anchorOffset)
    }
    function Ke(t, e, n) {
        var r = t.docView.parseRange(e, n)
          , o = r.node
          , i = r.fromOffset
          , s = r.toOffset
          , a = r.from
          , c = r.to
          , l = t.root.getSelection()
          , p = null
          , u = l.anchorNode;
        if (u && t.dom.contains(1 == u.nodeType ? u : u.parentNode) && (p = [{
            node: u,
            offset: l.anchorOffset
        }],
        Cs(l) || p.push({
            node: l.focusNode,
            offset: l.focusOffset
        })),
        ds.chrome && 8 === t.lastKeyCode)
            for (var h = s; h > i; h--) {
                var f = o.childNodes[h - 1]
                  , d = f.pmViewDesc;
                if ("BR" == f.nodeType && !d) {
                    s = h;
                    break
                }
                if (!d || d.size)
                    break
            }
        var m = t.state.doc
          , v = t.someProp("domParser") || wi.fromSchema(t.state.schema)
          , g = m.resolve(a)
          , y = null
          , w = v.parse(o, {
            topNode: g.parent,
            topMatch: g.parent.contentMatchAt(g.index()),
            topOpen: !0,
            from: i,
            to: s,
            preserveWhitespace: !g.parent.type.spec.code || "full",
            editableContent: !0,
            findPositions: p,
            ruleFromNode: He,
            context: g
        });
        if (p && null != p[0].pos) {
            var b = p[0].pos
              , k = p[1] && p[1].pos;
            null == k && (k = b),
            y = {
                anchor: b + a,
                head: k + a
            }
        }
        return {
            doc: w,
            sel: y,
            from: a,
            to: c
        }
    }
    function He(t) {
        var e = t.pmViewDesc;
        if (e)
            return e.parseRule();
        if ("BR" == t.nodeName && t.parentNode) {
            if (ds.safari && /^(ul|ol)$/i.test(t.parentNode.nodeName)) {
                var n = document.createElement("div");
                return n.appendChild(document.createElement("li")),
                {
                    skip: n
                }
            }
            if (t.parentNode.lastChild == t || ds.safari && /^(tr|table)$/i.test(t.parentNode.nodeName))
                return {
                    ignore: !0
                }
        } else if ("IMG" == t.nodeName && t.getAttribute("mark-placeholder"))
            return {
                ignore: !0
            }
    }
    function Ue(t, e, n, r) {
        if (e < 0) {
            var o = t.lastSelectionTime > Date.now() - 50 ? t.lastSelectionOrigin : null
              , i = Pe(t, o);
            if (!t.state.selection.eq(i)) {
                var s = t.state.tr.setSelection(i);
                "pointer" == o ? s.setMeta("pointer", !0) : "key" == o && s.scrollIntoView(),
                t.dispatch(s)
            }
        } else {
            var a = t.state.doc.resolve(e)
              , c = a.sharedDepth(n);
            e = a.before(c + 1),
            n = t.state.doc.resolve(n).after(c + 1);
            var l, p, u = t.state.selection, h = Ke(t, e, n), f = t.state.doc, d = f.slice(h.from, h.to);
            8 === t.lastKeyCode && Date.now() - 100 < t.lastKeyCodeTime ? (l = t.state.selection.to,
            p = "end") : (l = t.state.selection.from,
            p = "start"),
            t.lastKeyCode = null;
            var m = Ze(d.content, h.doc.content, h.from, l, p);
            if (!m) {
                if (!(r && u instanceof Qi && !u.empty && u.$head.sameParent(u.$anchor)) || t.composing || h.sel && h.sel.anchor != h.sel.head) {
                    if (h.sel) {
                        var v = Ge(t, t.state.doc, h.sel);
                        v && !v.eq(t.state.selection) && t.dispatch(t.state.tr.setSelection(v))
                    }
                    return
                }
                m = {
                    start: u.from,
                    endA: u.to,
                    endB: u.to
                }
            }
            t.domChangeCount++,
            t.state.selection.from < t.state.selection.to && m.start == m.endB && t.state.selection instanceof Qi && (m.start > t.state.selection.from && m.start <= t.state.selection.from + 2 ? m.start = t.state.selection.from : m.endA < t.state.selection.to && m.endA >= t.state.selection.to - 2 && (m.endB += t.state.selection.to - m.endA,
            m.endA = t.state.selection.to)),
            ds.ie && ds.ie_version <= 11 && m.endB == m.start + 1 && m.endA == m.start && m.start > h.from && "  " == h.doc.textBetween(m.start - h.from - 1, m.start - h.from + 1) && (m.start--,
            m.endA--,
            m.endB--);
            var g, y = h.doc.resolveNoCache(m.start - h.from), w = h.doc.resolveNoCache(m.endB - h.from);
            if (!(!y.sameParent(w) && y.pos < h.doc.content.size && (g = Hi.findFrom(h.doc.resolve(y.pos + 1), 1, !0)) && g.head == w.pos && t.someProp("handleKeyDown", function(e) {
                return e(t, Rt(13, "Enter"))
            })))
                if (t.state.selection.anchor > m.start && Xe(f, m.start, m.endA, y, w) && t.someProp("handleKeyDown", function(e) {
                    return e(t, Rt(8, "Backspace"))
                }))
                    ds.android && ds.chrome && t.domObserver.suppressSelectionUpdates();
                else {
                    var b, k, x, S, M = m.start, C = m.endA;
                    if (y.sameParent(w) && y.parent.inlineContent)
                        if (y.pos == w.pos)
                            ds.ie && ds.ie_version <= 11 && 0 == y.parentOffset && (t.domObserver.suppressSelectionUpdates(),
                            setTimeout(function() {
                                return Be(t)
                            }, 20)),
                            b = t.state.tr.delete(M, C),
                            k = f.resolve(m.start).marksAcross(f.resolve(m.endA));
                        else if (m.endA == m.endB && (S = f.resolve(m.start)) && (x = Qe(y.parent.content.cut(y.parentOffset, w.parentOffset), S.parent.content.cut(S.parentOffset, m.endA - S.start()))))
                            b = t.state.tr,
                            "add" == x.type ? b.addMark(M, C, x.mark) : b.removeMark(M, C, x.mark);
                        else if (y.parent.child(y.index()).isText && y.index() == w.index() - (w.textOffset ? 0 : 1)) {
                            var O = y.parent.textBetween(y.parentOffset, w.parentOffset);
                            if (t.someProp("handleTextInput", function(e) {
                                return e(t, M, C, O)
                            }))
                                return;
                            b = t.state.tr.insertText(O, M, C)
                        }
                    if (b || (b = t.state.tr.replace(M, C, h.doc.slice(m.start - h.from, m.endB - h.from))),
                    h.sel) {
                        var N = Ge(t, b.doc, h.sel);
                        N && !(ds.chrome && ds.android && t.composing && N.empty && N.head == M || ds.ie && N.empty && N.head == M) && b.setSelection(N)
                    }
                    k && b.ensureMarks(k),
                    t.dispatch(b.scrollIntoView())
                }
        }
    }
    function Ge(t, e, n) {
        return Math.max(n.anchor, n.head) > e.content.size ? null : Le(t, e.resolve(n.anchor), e.resolve(n.head))
    }
    function Qe(t, e) {
        for (var n, r, o, i = t.firstChild.marks, s = e.firstChild.marks, a = i, c = s, l = 0; l < s.length; l++)
            a = s[l].removeFromSet(a);
        for (var p = 0; p < i.length; p++)
            c = i[p].removeFromSet(c);
        if (1 == a.length && 0 == c.length)
            r = a[0],
            n = "add",
            o = function(t) {
                return t.mark(r.addToSet(t.marks))
            }
            ;
        else {
            if (0 != a.length || 1 != c.length)
                return null;
            r = c[0],
            n = "remove",
            o = function(t) {
                return t.mark(r.removeFromSet(t.marks))
            }
        }
        for (var u = [], h = 0; h < e.childCount; h++)
            u.push(o(e.child(h)));
        if (Ko.from(u).eq(t))
            return {
                mark: r,
                type: n
            }
    }
    function Xe(t, e, n, r, o) {
        if (!r.parent.isTextblock || n - e <= o.pos - r.pos || Ye(r, !0, !1) < o.pos)
            return !1;
        var i = t.resolve(e);
        if (i.parentOffset < i.parent.content.size || !i.parent.isTextblock)
            return !1;
        var s = t.resolve(Ye(i, !0, !0));
        return !(!s.parent.isTextblock || s.pos > n || Ye(s, !0, !1) < n) && r.parent.content.cut(r.parentOffset).eq(s.parent.content)
    }
    function Ye(t, e, n) {
        for (var r = t.depth, o = e ? t.end() : t.pos; r > 0 && (e || t.indexAfter(r) == t.node(r).childCount); )
            r--,
            o++,
            e = !1;
        if (n)
            for (var i = t.node(r).maybeChild(t.indexAfter(r)); i && !i.isLeaf; )
                i = i.firstChild,
                o++;
        return o
    }
    function Ze(t, e, n, r, o) {
        var i = t.findDiffStart(e, n);
        if (null == i)
            return null;
        var s = t.findDiffEnd(e, n + t.size, n + e.size)
          , a = s.a
          , c = s.b;
        return "end" == o && (r -= a + Math.max(0, i - Math.min(a, c)) - i),
        a < i && t.size < e.size ? (c = (i -= r <= i && r >= a ? i - r : 0) + (c - a),
        a = i) : c < i && (a = (i -= r <= i && r >= c ? i - r : 0) + (a - c),
        c = i),
        {
            start: i,
            endA: a,
            endB: c
        }
    }
    function tn(t, e) {
        for (var n = [], r = e.content, o = e.openStart, i = e.openEnd; o > 1 && i > 1 && 1 == r.childCount && 1 == r.firstChild.childCount; ) {
            o--,
            i--;
            var s = r.firstChild;
            n.push(s.type.name, s.type.hasRequiredAttrs() ? s.attrs : null),
            r = s.content
        }
        var a = t.someProp("clipboardSerializer") || Ti.fromSchema(t.state.schema)
          , c = ln()
          , l = c.createElement("div");
        l.appendChild(a.serializeFragment(r, {
            document: c
        }));
        for (var p, u = l.firstChild; u && 1 == u.nodeType && (p = Js[u.nodeName.toLowerCase()]); ) {
            for (var h = p.length - 1; h >= 0; h--) {
                for (var f = c.createElement(p[h]); l.firstChild; )
                    f.appendChild(l.firstChild);
                l.appendChild(f)
            }
            u = l.firstChild
        }
        return u && 1 == u.nodeType && u.setAttribute("data-pm-slice", o + " " + i + " " + JSON.stringify(n)),
        {
            dom: l,
            text: t.someProp("clipboardTextSerializer", function(t) {
                return t(e)
            }) || e.content.textBetween(0, e.content.size, "\n\n")
        }
    }
    function en(t, e, n, r, o) {
        var i, s, a = o.parent.type.spec.code;
        if (!n && !e)
            return null;
        var c = e && (r || a || !n);
        if (c) {
            if (t.someProp("transformPastedText", function(t) {
                e = t(e)
            }),
            a)
                return new Qo(Ko.from(t.state.schema.text(e)),0,0);
            var l = t.someProp("clipboardTextParser", function(t) {
                return t(e, o)
            });
            l ? s = l : (i = document.createElement("div"),
            e.trim().split(/(?:\r\n?|\n)+/).forEach(function(t) {
                i.appendChild(document.createElement("p")).textContent = t
            }))
        } else
            t.someProp("transformPastedHTML", function(t) {
                n = t(n)
            }),
            i = pn(n);
        var p = i && i.querySelector("[data-pm-slice]")
          , u = p && /^(\d+) (\d+) (.*)/.exec(p.getAttribute("data-pm-slice"));
        if (!s) {
            var h = t.someProp("clipboardParser") || t.someProp("domParser") || wi.fromSchema(t.state.schema);
            s = h.parseSlice(i, {
                preserveWhitespace: !(!c && !u),
                context: o
            })
        }
        return s = u ? un(cn(s, +u[1], +u[2]), u[3]) : Qo.maxOpen(nn(s.content, o), !1),
        t.someProp("transformPasted", function(t) {
            s = t(s)
        }),
        s
    }
    function nn(t, e) {
        if (t.childCount < 2)
            return t;
        for (var n = e.depth; n >= 0; n--) {
            var r = function(n) {
                var r = e.node(n).contentMatchAt(e.index(n))
                  , o = void 0
                  , i = [];
                if (t.forEach(function(t) {
                    if (i) {
                        var e, n = r.findWrapping(t.type);
                        if (!n)
                            return i = null;
                        if (e = i.length && o.length && on(n, o, t, i[i.length - 1], 0))
                            i[i.length - 1] = e;
                        else {
                            i.length && (i[i.length - 1] = sn(i[i.length - 1], o.length));
                            var s = rn(t, n);
                            i.push(s),
                            r = r.matchType(s.type, s.attrs),
                            o = n
                        }
                    }
                }),
                i)
                    return {
                        v: Ko.from(i)
                    }
            }(n);
            if (r)
                return r.v
        }
        return t
    }
    function rn(t, e, n) {
        void 0 === n && (n = 0);
        for (var r = e.length - 1; r >= n; r--)
            t = e[r].create(null, Ko.from(t));
        return t
    }
    function on(t, e, n, r, o) {
        if (o < t.length && o < e.length && t[o] == e[o]) {
            var i = on(t, e, n, r.lastChild, o + 1);
            if (i)
                return r.copy(r.content.replaceChild(r.childCount - 1, i));
            if (r.contentMatchAt(r.childCount).matchType(o == t.length - 1 ? n.type : t[o + 1]))
                return r.copy(r.content.append(Ko.from(rn(n, t, o + 1))))
        }
    }
    function sn(t, e) {
        if (0 == e)
            return t;
        var n = t.content.replaceChild(t.childCount - 1, sn(t.lastChild, e - 1))
          , r = t.contentMatchAt(t.childCount).fillBefore(Ko.empty, !0);
        return t.copy(n.append(r))
    }
    function an(t, e, n, r, o, i) {
        var s = e < 0 ? t.firstChild : t.lastChild
          , a = s.content;
        return o < r - 1 && (a = an(a, e, n, r, o + 1, i)),
        o >= n && (a = e < 0 ? s.contentMatchAt(0).fillBefore(a, t.childCount > 1 || i <= o).append(a) : a.append(s.contentMatchAt(s.childCount).fillBefore(Ko.empty, !0))),
        t.replaceChild(e < 0 ? 0 : t.childCount - 1, s.copy(a))
    }
    function cn(t, e, n) {
        return e < t.openStart && (t = new Qo(an(t.content, -1, e, t.openStart, 0, t.openEnd),e,t.openEnd)),
        n < t.openEnd && (t = new Qo(an(t.content, 1, n, t.openEnd, 0, 0),t.openStart,n)),
        t
    }
    function ln() {
        return Ws || (Ws = document.implementation.createHTMLDocument("title"))
    }
    function pn(t) {
        var e = /(\s*<meta [^>]*>)*/.exec(t);
        e && (t = t.slice(e[0].length));
        var n, r = ln().createElement("div"), o = /(?:<meta [^>]*>)*<([a-z][^>\s]+)/i.exec(t), i = 0;
        (n = o && Js[o[1].toLowerCase()]) && (t = n.map(function(t) {
            return "<" + t + ">"
        }).join("") + t + n.map(function(t) {
            return "</" + t + ">"
        }).reverse().join(""),
        i = n.length),
        r.innerHTML = t;
        for (var s = 0; s < i; s++)
            r = r.firstChild;
        return r
    }
    function un(t, e) {
        if (!t.size)
            return t;
        var n, r = t.content.firstChild.type.schema;
        try {
            n = JSON.parse(e)
        } catch (e) {
            return t
        }
        for (var o = t.content, i = t.openStart, s = t.openEnd, a = n.length - 2; a >= 0; a -= 2) {
            var c = r.nodes[n[a]];
            if (!c || c.hasRequiredAttrs())
                break;
            o = Ko.from(c.create(n[a + 1], o)),
            i++,
            s++
        }
        return new Qo(o,i,s)
    }
    function hn(t) {
        Qs || (Qs = !0,
        "normal" == getComputedStyle(t.dom).whiteSpace && console.warn("ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package."))
    }
    function fn(t) {
        t.shiftKey = !1,
        t.mouseDown = null,
        t.lastKeyCode = null,
        t.lastKeyCodeTime = 0,
        t.lastClick = {
            time: 0,
            x: 0,
            y: 0,
            type: ""
        },
        t.lastSelectionOrigin = null,
        t.lastSelectionTime = 0,
        t.composing = !1,
        t.composingTimeout = null,
        t.compositionNodes = [],
        t.compositionEndedAt = -2e8,
        t.domObserver = new Gs(t,function(e, n, r) {
            return Ue(t, e, n, r)
        }
        ),
        t.domObserver.start(),
        t.domChangeCount = 0,
        t.eventHandlers = Object.create(null);
        for (var e in Xs)
            !function(e) {
                var n = Xs[e];
                t.dom.addEventListener(e, t.eventHandlers[e] = function(e) {
                    !yn(t, e) || gn(t, e) || !t.editable && e.type in Ys || n(t, e)
                }
                )
            }(e);
        ds.safari && t.dom.addEventListener("input", function() {
            return null
        }),
        vn(t)
    }
    function dn(t, e) {
        t.lastSelectionOrigin = e,
        t.lastSelectionTime = Date.now()
    }
    function mn(t) {
        t.domObserver.stop();
        for (var e in t.eventHandlers)
            t.dom.removeEventListener(e, t.eventHandlers[e]);
        clearTimeout(t.composingTimeout)
    }
    function vn(t) {
        t.someProp("handleDOMEvents", function(e) {
            for (var n in e)
                t.eventHandlers[n] || t.dom.addEventListener(n, t.eventHandlers[n] = function(e) {
                    return gn(t, e)
                }
                )
        })
    }
    function gn(t, e) {
        return t.someProp("handleDOMEvents", function(n) {
            var r = n[e.type];
            return !!r && (r(t, e) || e.defaultPrevented)
        })
    }
    function yn(t, e) {
        if (!e.bubbles)
            return !0;
        if (e.defaultPrevented)
            return !1;
        for (var n = e.target; n != t.dom; n = n.parentNode)
            if (!n || 11 == n.nodeType || n.pmViewDesc && n.pmViewDesc.stopEvent(e))
                return !1;
        return !0
    }
    function wn(t, e) {
        gn(t, e) || !Xs[e.type] || !t.editable && e.type in Ys || Xs[e.type](t, e)
    }
    function bn(t) {
        return {
            left: t.clientX,
            top: t.clientY
        }
    }
    function kn(t, e) {
        var n = e.x - t.clientX
          , r = e.y - t.clientY;
        return n * n + r * r < 100
    }
    function xn(t, e, n, r, o) {
        if (-1 == r)
            return !1;
        for (var i = t.state.doc.resolve(r), s = i.depth + 1; s > 0; s--) {
            var a = function(r) {
                if (t.someProp(e, function(e) {
                    return r > i.depth ? e(t, n, i.nodeAfter, i.before(r), o, !0) : e(t, n, i.node(r), i.before(r), o, !1)
                }))
                    return {
                        v: !0
                    }
            }(s);
            if (a)
                return a.v
        }
        return !1
    }
    function Sn(t, e, n) {
        t.focused || t.focus();
        var r = t.state.tr.setSelection(e);
        "pointer" == n && r.setMeta("pointer", !0),
        t.dispatch(r)
    }
    function Mn(t, e) {
        if (-1 == e)
            return !1;
        var n = t.state.doc.resolve(e)
          , r = n.nodeAfter;
        return !!(r && r.isAtom && Yi.isSelectable(r)) && (Sn(t, new Yi(n), "pointer"),
        !0)
    }
    function Cn(t, e) {
        if (-1 == e)
            return !1;
        var n, r, o = t.state.selection;
        o instanceof Yi && (n = o.node);
        for (var i = t.state.doc.resolve(e), s = i.depth + 1; s > 0; s--) {
            var a = s > i.depth ? i.nodeAfter : i.node(s);
            if (Yi.isSelectable(a)) {
                r = n && o.$from.depth > 0 && s >= o.$from.depth && i.before(o.$from.depth + 1) == o.$from.pos ? i.before(o.$from.depth) : i.before(s);
                break
            }
        }
        return null != r && (Sn(t, Yi.create(t.state.doc, r), "pointer"),
        !0)
    }
    function On(t, e, n, r, o) {
        return xn(t, "handleClickOn", e, n, r) || t.someProp("handleClick", function(n) {
            return n(t, e, r)
        }) || (o ? Cn(t, n) : Mn(t, n))
    }
    function Nn(t, e, n, r) {
        return xn(t, "handleDoubleClickOn", e, n, r) || t.someProp("handleDoubleClick", function(n) {
            return n(t, e, r)
        })
    }
    function Tn(t, e, n, r) {
        return xn(t, "handleTripleClickOn", e, n, r) || t.someProp("handleTripleClick", function(n) {
            return n(t, e, r)
        }) || Dn(t, n)
    }
    function Dn(t, e) {
        var n = t.state.doc;
        if (-1 == e)
            return !!n.inlineContent && (Sn(t, Qi.create(n, 0, n.content.size), "pointer"),
            !0);
        for (var r = n.resolve(e), o = r.depth + 1; o > 0; o--) {
            var i = o > r.depth ? r.nodeAfter : r.node(o)
              , s = r.before(o);
            if (i.inlineContent)
                Sn(t, Qi.create(n, s + 1, s + 1 + i.content.size), "pointer");
            else {
                if (!Yi.isSelectable(i))
                    continue;
                Sn(t, Yi.create(n, s), "pointer")
            }
            return !0
        }
    }
    function En(t) {
        return Rn(t)
    }
    function An(t, e) {
        return !!t.composing || !!(ds.safari && Math.abs(e.timeStamp - t.compositionEndedAt) < 500) && (t.compositionEndedAt = -2e8,
        !0)
    }
    function In(t, e) {
        clearTimeout(t.composingTimeout),
        e > -1 && (t.composingTimeout = setTimeout(function() {
            return Rn(t)
        }, e))
    }
    function Rn(t, e) {
        for (t.composing = !1; t.compositionNodes.length > 0; )
            t.compositionNodes.pop().markParentsDirty();
        return !(!e && !t.docView.dirty) && (t.updateState(t.state),
        !0)
    }
    function zn(t, e) {
        var n = t.dom.ownerDocument
          , r = n.body.appendChild(n.createElement("div"));
        r.appendChild(e),
        r.style.cssText = "position: fixed; left: -10000px; top: 10px";
        var o = getSelection()
          , i = n.createRange();
        i.selectNodeContents(e),
        t.dom.blur(),
        o.removeAllRanges(),
        o.addRange(i),
        setTimeout(function() {
            n.body.removeChild(r),
            t.focus()
        }, 50)
    }
    function Pn(t) {
        return 0 == t.openStart && 0 == t.openEnd && 1 == t.content.childCount ? t.content.firstChild : null
    }
    function Bn(t, e) {
        var n = t.dom.ownerDocument
          , r = t.shiftKey || t.state.selection.$from.parent.type.spec.code
          , o = n.body.appendChild(n.createElement(r ? "textarea" : "div"));
        r || (o.contentEditable = "true"),
        o.style.cssText = "position: fixed; left: -10000px; top: 10px",
        o.focus(),
        setTimeout(function() {
            t.focus(),
            n.body.removeChild(o),
            r ? Vn(t, o.value, null, e) : Vn(t, o.textContent, o.innerHTML, e)
        }, 50)
    }
    function Vn(t, e, n, r) {
        var o = en(t, e, n, t.shiftKey, t.state.selection.$from);
        if (!t.someProp("handlePaste", function(e) {
            return e(t, r, o || Qo.empty)
        }) && o) {
            var i = Pn(o)
              , s = i ? t.state.tr.replaceSelectionWith(i, t.shiftKey) : t.state.tr.replaceSelection(o);
            t.dispatch(s.scrollIntoView().setMeta("paste", !0).setMeta("uiEvent", "paste"))
        }
    }
    function $n(t, e) {
        if (t == e)
            return !0;
        for (var n in t)
            if (t[n] !== e[n])
                return !1;
        for (var r in e)
            if (!(r in t))
                return !1;
        return !0
    }
    function _n(t, e, n, r, o, i, s) {
        for (var a = t.slice(), c = 0; c < n.maps.length; c++)
            n.maps[c].forEach(function(t, e, n, r) {
                for (var s = 0; s < a.length; s += 3) {
                    var c = a[s + 1]
                      , l = void 0;
                    -1 == c || t > c + i || (e >= a[s] + i ? a[s + 1] = -1 : (l = r - n - (e - t) + (i - o)) && (a[s] += l,
                    a[s + 1] += l))
                }
            });
        for (var l = !1, p = 0; p < a.length; p += 3)
            if (-1 == a[p + 1]) {
                var u = n.map(a[p] + i)
                  , h = u - o;
                if (h < 0 || h >= r.content.size) {
                    l = !0;
                    continue
                }
                var f = n.map(t[p + 1] + i, -1) - o
                  , d = r.content.findIndex(h)
                  , m = d.index
                  , v = d.offset
                  , g = r.maybeChild(m);
                if (g && v == h && v + g.nodeSize == f) {
                    var y = a[p + 2].mapInner(n, g, u + 1, a[p] + i + 1, s);
                    y != da ? (a[p] = h,
                    a[p + 1] = f,
                    a[p + 2] = y) : (a[p + 1] = -2,
                    l = !0)
                } else
                    l = !0
            }
        if (l) {
            var w = Jn(Fn(a, t, e || [], n, o, i, s), r, 0, s);
            e = w.local;
            for (var b = 0; b < a.length; b += 3)
                a[b + 1] < 0 && (a.splice(b, 3),
                b -= 3);
            for (var k = 0, x = 0; k < w.children.length; k += 3) {
                for (var S = w.children[k]; x < a.length && a[x] < S; )
                    x += 3;
                a.splice(x, 0, w.children[k], w.children[k + 1], w.children[k + 2])
            }
        }
        return new fa(e && e.sort(Wn),a)
    }
    function qn(t, e) {
        if (!e || !t.length)
            return t;
        for (var n = [], r = 0; r < t.length; r++) {
            var o = t[r];
            n.push(new la(o.from + e,o.to + e,o.type))
        }
        return n
    }
    function Fn(t, e, n, r, o, i, s) {
        function a(t, e) {
            for (var i = 0; i < t.local.length; i++) {
                var c = t.local[i].map(r, o, e);
                c ? n.push(c) : s.onRemove && s.onRemove(t.local[i].spec)
            }
            for (var l = 0; l < t.children.length; l += 3)
                a(t.children[l + 2], t.children[l] + e + 1)
        }
        for (var c = 0; c < t.length; c += 3)
            -1 == t[c + 1] && a(t[c + 2], e[c] + i + 1);
        return n
    }
    function Ln(t, e, n) {
        if (e.isLeaf)
            return null;
        for (var r = n + e.nodeSize, o = null, i = 0, s = void 0; i < t.length; i++)
            (s = t[i]) && s.from > n && s.to < r && ((o || (o = [])).push(s),
            t[i] = null);
        return o
    }
    function jn(t) {
        for (var e = [], n = 0; n < t.length; n++)
            null != t[n] && e.push(t[n]);
        return e
    }
    function Jn(t, e, n, r) {
        var o = []
          , i = !1;
        e.forEach(function(e, s) {
            var a = Ln(t, e, s + n);
            if (a) {
                i = !0;
                var c = Jn(a, e, n + s + 1, r);
                c != da && o.push(s, s + e.nodeSize, c)
            }
        });
        for (var s = qn(i ? jn(t) : t, -n).sort(Wn), a = 0; a < s.length; a++)
            s[a].type.valid(e, s[a]) || (r.onRemove && r.onRemove(s[a].spec),
            s.splice(a--, 1));
        return s.length || o.length ? new fa(s,o) : da
    }
    function Wn(t, e) {
        return t.from - e.from || t.to - e.to
    }
    function Kn(t) {
        for (var e = t, n = 0; n < e.length - 1; n++) {
            var r = e[n];
            if (r.from != r.to)
                for (var o = n + 1; o < e.length; o++) {
                    var i = e[o];
                    {
                        if (i.from != r.from) {
                            i.from < r.to && (e == t && (e = t.slice()),
                            e[n] = r.copy(r.from, i.from),
                            Hn(e, o, r.copy(i.from, r.to)));
                            break
                        }
                        i.to != r.to && (e == t && (e = t.slice()),
                        e[o] = i.copy(i.from, r.to),
                        Hn(e, o + 1, i.copy(r.to, i.to)))
                    }
                }
        }
        return e
    }
    function Hn(t, e, n) {
        for (; e < t.length && Wn(n, t[e]) > 0; )
            e++;
        t.splice(e, 0, n)
    }
    function Un(t) {
        var e = [];
        return t.someProp("decorations", function(n) {
            var r = n(t.state);
            r && r != da && e.push(r)
        }),
        t.cursorWrapper && e.push(fa.create(t.state.doc, [t.cursorWrapper.deco])),
        ma.from(e)
    }
    function Gn(t) {
        var e = Object.create(null);
        return e.class = "ProseMirror",
        e.contenteditable = String(t.editable),
        t.someProp("attributes", function(n) {
            if ("function" == typeof n && (n = n(t.state)),
            n)
                for (var r in n)
                    "class" == r ? e.class += " " + n[r] : e[r] || "contenteditable" == r || "nodeName" == r || (e[r] = String(n[r]))
        }),
        [la.node(0, t.state.doc.content.size, e)]
    }
    function Qn(t) {
        var e = t.state.selection
          , n = e.$head
          , r = e.$anchor
          , o = e.visible;
        if (t.markCursor) {
            var i = document.createElement("img");
            i.setAttribute("mark-placeholder", "true"),
            t.cursorWrapper = {
                dom: i,
                deco: la.widget(n.pos, i, {
                    raw: !0,
                    marks: t.markCursor
                })
            }
        } else if (o || n.pos != r.pos)
            t.cursorWrapper = null;
        else {
            var s;
            !t.cursorWrapper || t.cursorWrapper.dom.childNodes.length ? ((s = document.createElement("div")).style.position = "absolute",
            s.style.left = "-100000px") : t.cursorWrapper.deco.pos != n.pos && (s = t.cursorWrapper.dom),
            s && (t.cursorWrapper = {
                dom: s,
                deco: la.widget(n.pos, s, {
                    raw: !0
                })
            })
        }
    }
    function Xn(t) {
        return !t.someProp("editable", function(e) {
            return !1 === e(t.state)
        })
    }
    function Yn(t, e) {
        var n = Math.min(t.$anchor.sharedDepth(t.head), e.$anchor.sharedDepth(e.head));
        return t.$anchor.node(n) != e.$anchor.node(n)
    }
    function Zn(t) {
        var e = {};
        return t.someProp("nodeViews", function(t) {
            for (var n in t)
                Object.prototype.hasOwnProperty.call(e, n) || (e[n] = t[n])
        }),
        e
    }
    function tr(t, e) {
        var n = 0
          , r = 0;
        for (var o in t) {
            if (t[o] != e[o])
                return !0;
            n++
        }
        for (var i in e)
            r++;
        return n != r
    }
    function er(t) {
        var e = t.split(/-(?!$)/)
          , n = e[e.length - 1];
        "Space" == n && (n = " ");
        for (var r, o, i, s, a = 0; a < e.length - 1; a++) {
            var c = e[a];
            if (/^(cmd|meta|m)$/i.test(c))
                s = !0;
            else if (/^a(lt)?$/i.test(c))
                r = !0;
            else if (/^(c|ctrl|control)$/i.test(c))
                o = !0;
            else if (/^s(hift)?$/i.test(c))
                i = !0;
            else {
                if (!/^mod$/i.test(c))
                    throw new Error("Unrecognized modifier name: " + c);
                Aa ? s = !0 : o = !0
            }
        }
        return r && (n = "Alt-" + n),
        o && (n = "Ctrl-" + n),
        s && (n = "Meta-" + n),
        i && (n = "Shift-" + n),
        n
    }
    function nr(t) {
        var e = Object.create(null);
        for (var n in t)
            e[er(n)] = t[n];
        return e
    }
    function rr(t, e, n) {
        return e.altKey && (t = "Alt-" + t),
        e.ctrlKey && (t = "Ctrl-" + t),
        e.metaKey && (t = "Meta-" + t),
        !1 !== n && e.shiftKey && (t = "Shift-" + t),
        t
    }
    function or(t) {
        return new ps({
            props: {
                handleKeyDown: ir(t)
            }
        })
    }
    function ir(t) {
        var e = nr(t);
        return function(t, n) {
            var r, o = Ea(n), i = 1 == o.length && " " != o, s = e[rr(o, n, !i)];
            if (s && s(t.state, t.dispatch, t))
                return !0;
            if (i && (n.shiftKey || n.altKey || n.metaKey) && (r = ba[n.keyCode]) && r != o) {
                var a = e[rr(r, n, !0)];
                if (a && a(t.state, t.dispatch, t))
                    return !0
            } else if (i && n.shiftKey) {
                var c = e[rr(o, n, !0)];
                if (c && c(t.state, t.dispatch, t))
                    return !0
            }
            return !1
        }
    }
    function sr(t) {
        return function(e, n, r, o) {
            var i = t;
            if (n[1]) {
                var s = n[0].lastIndexOf(n[1]);
                i += n[0].slice(s + n[1].length);
                var a = (r += s) - o;
                a > 0 && (i = n[0].slice(s - a, s) + i,
                r = o)
            }
            return e.tr.insertText(i, r, o)
        }
    }
    function ar(t) {
        var e = t.rules
          , n = new ps({
            state: {
                init: function() {
                    return null
                },
                apply: function(t, e) {
                    var n = t.getMeta(this);
                    return n || (t.selectionSet || t.docChanged ? null : e)
                }
            },
            props: {
                handleTextInput: function(t, r, o, i) {
                    return cr(t, r, o, i, e, n)
                },
                handleDOMEvents: {
                    compositionend: function(t) {
                        setTimeout(function() {
                            var r = t.state.selection.$cursor;
                            r && cr(t, r.pos, r.pos, "", e, n)
                        })
                    }
                }
            },
            isInputRules: !0
        });
        return n
    }
    function cr(t, e, n, r, o, i) {
        if (t.composing)
            return !1;
        var s = t.state
          , a = s.doc.resolve(e);
        if (a.parent.type.spec.code)
            return !1;
        for (var c = a.parent.textBetween(Math.max(0, a.parentOffset - za), a.parentOffset, null, "￼") + r, l = 0; l < o.length; l++) {
            var p = o[l].match.exec(c)
              , u = p && o[l].handler(s, p, e - (p[0].length - r.length), n);
            if (u)
                return t.dispatch(u.setMeta(i, {
                    transform: u,
                    from: e,
                    to: n,
                    text: r
                })),
                !0
        }
        return !1
    }
    function lr(t, e) {
        for (var n = t.plugins, r = 0; r < n.length; r++) {
            var o = n[r]
              , i = void 0;
            if (o.spec.isInputRules && (i = o.getState(t))) {
                if (e) {
                    for (var s = t.tr, a = i.transform, c = a.steps.length - 1; c >= 0; c--)
                        s.step(a.steps[c].invert(a.docs[c]));
                    var l = s.doc.resolve(i.from).marks();
                    e(s.replaceWith(i.from, i.to, t.schema.text(i.text, l)))
                }
                return !0
            }
        }
        return !1
    }
    function pr(t, e, n, r) {
        return new Ra(t,function(t, o, i, s) {
            var a = n instanceof Function ? n(o) : n
              , c = t.tr.delete(i, s)
              , l = c.doc.resolve(i).blockRange()
              , p = l && Q(l, e, a);
            if (!p)
                return null;
            c.wrap(l, p);
            var u = c.doc.resolve(i - 1).nodeBefore;
            return u && u.type == e && nt(c.doc, i - 1) && (!r || r(o, u)) && c.join(i - 1),
            c
        }
        )
    }
    function ur(t, e, n) {
        return new Ra(t,function(t, r, o, i) {
            var s = t.doc.resolve(o)
              , a = n instanceof Function ? n(r) : n;
            return s.node(-1).canReplaceWith(s.index(-1), s.indexAfter(-1), e) ? t.tr.delete(o, i).setBlockType(o, o, e, a) : null
        }
        )
    }
    function hr(t, e) {
        var n;
        return t.forEach(function(t, r) {
            if (t.selection && 0 == e--)
                return n = r,
                !1
        }),
        t.slice(n)
    }
    function fr(t, e, n, r) {
        var o, i = n.getMeta(Za);
        if (i)
            return i.historyState;
        n.getMeta(tc) && (t = new Ga(t.done,t.undone,null,0));
        var s = n.getMeta("appendedTransaction");
        if (0 == n.steps.length)
            return t;
        if (s && s.getMeta(Za))
            return s.getMeta(Za).redo ? new Ga(t.done.addTransform(n, null, r, yr(e)),t.undone,mr(n.mapping.maps[n.steps.length - 1]),t.prevTime) : new Ga(t.done,t.undone.addTransform(n, null, r, yr(e)),null,t.prevTime);
        if (!1 === n.getMeta("addToHistory") || s && !1 === s.getMeta("addToHistory"))
            return (o = n.getMeta("rebased")) ? new Ga(t.done.rebased(n, o),t.undone.rebased(n, o),vr(t.prevRanges, n.mapping),t.prevTime) : new Ga(t.done.addMaps(n.mapping.maps),t.undone.addMaps(n.mapping.maps),vr(t.prevRanges, n.mapping),t.prevTime);
        var a = 0 == t.prevTime || !s && (t.prevTime < (n.time || 0) - r.newGroupDelay || !dr(n, t.prevRanges))
          , c = s ? vr(t.prevRanges, n.mapping) : mr(n.mapping.maps[n.steps.length - 1]);
        return new Ga(t.done.addTransform(n, a ? e.selection.getBookmark() : null, r, yr(e)),Ha.empty,c,n.time)
    }
    function dr(t, e) {
        if (!e)
            return !1;
        if (!t.docChanged)
            return !0;
        var n = !1;
        return t.mapping.maps[0].forEach(function(t, r) {
            for (var o = 0; o < e.length; o += 2)
                t <= e[o + 1] && r >= e[o] && (n = !0)
        }),
        n
    }
    function mr(t) {
        var e = [];
        return t.forEach(function(t, n, r, o) {
            return e.push(r, o)
        }),
        e
    }
    function vr(t, e) {
        if (!t)
            return null;
        for (var n = [], r = 0; r < t.length; r += 2) {
            var o = e.map(t[r], 1)
              , i = e.map(t[r + 1], -1);
            o <= i && n.push(o, i)
        }
        return n
    }
    function gr(t, e, n, r) {
        var o = yr(e)
          , i = Za.get(e).spec.config
          , s = (r ? t.undone : t.done).popEvent(e, o);
        if (s) {
            var a = s.selection.resolve(s.transform.doc)
              , c = (r ? t.done : t.undone).addTransform(s.transform, e.selection.getBookmark(), i, o)
              , l = new Ga(r ? c : s.remaining,r ? s.remaining : c,null,0);
            n(s.transform.setSelection(a).setMeta(Za, {
                redo: r,
                historyState: l
            }).scrollIntoView())
        }
    }
    function yr(t) {
        var e = t.plugins;
        if (Ya != e) {
            Xa = !1,
            Ya = e;
            for (var n = 0; n < e.length; n++)
                if (e[n].spec.historyPreserveItems) {
                    Xa = !0;
                    break
                }
        }
        return Xa
    }
    function wr(t) {
        return t = {
            depth: t && t.depth || 100,
            newGroupDelay: t && t.newGroupDelay || 500
        },
        new ps({
            key: Za,
            state: {
                init: function() {
                    return new Ga(Ha.empty,Ha.empty,null,0)
                },
                apply: function(e, n, r) {
                    return fr(n, r, e, t)
                }
            },
            config: t
        })
    }
    function br(t, e) {
        var n = Za.getState(t);
        return !(!n || 0 == n.done.eventCount) && (e && gr(n, t, e, !1),
        !0)
    }
    function kr(t, e) {
        var n = Za.getState(t);
        return !(!n || 0 == n.undone.eventCount) && (e && gr(n, t, e, !0),
        !0)
    }
    function xr(t, e) {
        return !t.selection.empty && (e && e(t.tr.deleteSelection().scrollIntoView()),
        !0)
    }
    function Sr(t, e, n) {
        var r = t.selection.$cursor;
        if (!r || (n ? !n.endOfTextblock("backward", t) : r.parentOffset > 0))
            return !1;
        var o = Or(r);
        if (!o) {
            var i = r.blockRange()
              , s = i && G(i);
            return null != s && (e && e(t.tr.lift(i, s).scrollIntoView()),
            !0)
        }
        var a = o.nodeBefore;
        if (!a.type.spec.isolating && Fr(t, o, e))
            return !0;
        if (0 == r.parent.content.size && (Mr(a, "end") || Yi.isSelectable(a))) {
            if (e) {
                var c = t.tr.deleteRange(r.before(), r.after());
                c.setSelection(Mr(a, "end") ? Hi.findFrom(c.doc.resolve(c.mapping.map(o.pos, -1)), -1) : Yi.create(c.doc, o.pos - a.nodeSize)),
                e(c.scrollIntoView())
            }
            return !0
        }
        return !(!a.isAtom || o.depth != r.depth - 1) && (e && e(t.tr.delete(o.pos - a.nodeSize, o.pos).scrollIntoView()),
        !0)
    }
    function Mr(t, e) {
        for (; t; t = "start" == e ? t.firstChild : t.lastChild)
            if (t.isTextblock)
                return !0;
        return !1
    }
    function Cr(t, e, n) {
        var r = t.selection.$cursor;
        if (!r || (n ? !n.endOfTextblock("backward", t) : r.parentOffset > 0))
            return !1;
        var o = Or(r)
          , i = o && o.nodeBefore;
        return !(!i || !Yi.isSelectable(i)) && (e && e(t.tr.setSelection(Yi.create(t.doc, o.pos - i.nodeSize)).scrollIntoView()),
        !0)
    }
    function Or(t) {
        if (!t.parent.type.spec.isolating)
            for (var e = t.depth - 1; e >= 0; e--) {
                if (t.index(e) > 0)
                    return t.doc.resolve(t.before(e + 1));
                if (t.node(e).type.spec.isolating)
                    break
            }
        return null
    }
    function Nr(t, e, n) {
        var r = t.selection.$cursor;
        if (!r || (n ? !n.endOfTextblock("forward", t) : r.parentOffset < r.parent.content.size))
            return !1;
        var o = Dr(r);
        if (!o)
            return !1;
        var i = o.nodeAfter;
        if (Fr(t, o, e))
            return !0;
        if (0 == r.parent.content.size && (Mr(i, "start") || Yi.isSelectable(i))) {
            if (e) {
                var s = t.tr.deleteRange(r.before(), r.after());
                s.setSelection(Mr(i, "start") ? Hi.findFrom(s.doc.resolve(s.mapping.map(o.pos)), 1) : Yi.create(s.doc, s.mapping.map(o.pos))),
                e(s.scrollIntoView())
            }
            return !0
        }
        return !(!i.isAtom || o.depth != r.depth - 1) && (e && e(t.tr.delete(o.pos, o.pos + i.nodeSize).scrollIntoView()),
        !0)
    }
    function Tr(t, e, n) {
        var r = t.selection.$cursor;
        if (!r || (n ? !n.endOfTextblock("forward", t) : r.parentOffset < r.parent.content.size))
            return !1;
        var o = Dr(r)
          , i = o && o.nodeAfter;
        return !(!i || !Yi.isSelectable(i)) && (e && e(t.tr.setSelection(Yi.create(t.doc, o.pos)).scrollIntoView()),
        !0)
    }
    function Dr(t) {
        if (!t.parent.type.spec.isolating)
            for (var e = t.depth - 1; e >= 0; e--) {
                var n = t.node(e);
                if (t.index(e) + 1 < n.childCount)
                    return t.doc.resolve(t.after(e + 1));
                if (n.type.spec.isolating)
                    break
            }
        return null
    }
    function Er(t, e) {
        var n, r = t.selection, o = r instanceof Yi;
        if (o) {
            if (r.node.isTextblock || !nt(t.doc, r.from))
                return !1;
            n = r.from
        } else if (null == (n = ot(t.doc, r.from, -1)))
            return !1;
        if (e) {
            var i = t.tr.join(n);
            o && i.setSelection(Yi.create(i.doc, n - t.doc.resolve(n).nodeBefore.nodeSize)),
            e(i.scrollIntoView())
        }
        return !0
    }
    function Ar(t, e) {
        var n, r = t.selection;
        if (r instanceof Yi) {
            if (r.node.isTextblock || !nt(t.doc, r.to))
                return !1;
            n = r.to
        } else if (null == (n = ot(t.doc, r.to, 1)))
            return !1;
        return e && e(t.tr.join(n).scrollIntoView()),
        !0
    }
    function Ir(t, e) {
        var n = t.selection
          , r = n.$from
          , o = n.$to
          , i = r.blockRange(o)
          , s = i && G(i);
        return null != s && (e && e(t.tr.lift(i, s).scrollIntoView()),
        !0)
    }
    function Rr(t, e) {
        var n = t.selection
          , r = n.$head
          , o = n.$anchor;
        return !(!r.parent.type.spec.code || !r.sameParent(o)) && (e && e(t.tr.insertText("\n").scrollIntoView()),
        !0)
    }
    function zr(t, e) {
        var n = t.selection
          , r = n.$head
          , o = n.$anchor;
        if (!r.parent.type.spec.code || !r.sameParent(o))
            return !1;
        var i = r.node(-1)
          , s = r.indexAfter(-1)
          , a = i.contentMatchAt(s).defaultType;
        if (!i.canReplaceWith(s, s, a))
            return !1;
        if (e) {
            var c = r.after()
              , l = t.tr.replaceWith(c, c, a.createAndFill());
            l.setSelection(Hi.near(l.doc.resolve(c), 1)),
            e(l.scrollIntoView())
        }
        return !0
    }
    function Pr(t, e) {
        var n = t.selection
          , r = n.$from
          , o = n.$to;
        if (r.parent.inlineContent || o.parent.inlineContent)
            return !1;
        var i = r.parent.contentMatchAt(o.indexAfter()).defaultType;
        if (!i || !i.isTextblock)
            return !1;
        if (e) {
            var s = (!r.parentOffset && o.index() < o.parent.childCount ? r : o).pos
              , a = t.tr.insert(s, i.createAndFill());
            a.setSelection(Qi.create(a.doc, s + 1)),
            e(a.scrollIntoView())
        }
        return !0
    }
    function Br(t, e) {
        var n = t.selection.$cursor;
        if (!n || n.parent.content.size)
            return !1;
        if (n.depth > 1 && n.after() != n.end(-1)) {
            var r = n.before();
            if (et(t.doc, r))
                return e && e(t.tr.split(r).scrollIntoView()),
                !0
        }
        var o = n.blockRange()
          , i = o && G(o);
        return null != i && (e && e(t.tr.lift(o, i).scrollIntoView()),
        !0)
    }
    function Vr(t, e) {
        var n = t.selection
          , r = n.$from
          , o = n.$to;
        if (t.selection instanceof Yi && t.selection.node.isBlock)
            return !(!r.parentOffset || !et(t.doc, r.pos)) && (e && e(t.tr.split(r.pos).scrollIntoView()),
            !0);
        if (!r.parent.isBlock)
            return !1;
        if (e) {
            var i = o.parentOffset == o.parent.content.size
              , s = t.tr;
            t.selection instanceof Qi && s.deleteSelection();
            var a = 0 == r.depth ? null : r.node(-1).contentMatchAt(r.indexAfter(-1)).defaultType
              , c = i && a ? [{
                type: a
            }] : null
              , l = et(s.doc, s.mapping.map(r.pos), 1, c);
            c || l || !et(s.doc, s.mapping.map(r.pos), 1, a && [{
                type: a
            }]) || (c = [{
                type: a
            }],
            l = !0),
            l && (s.split(s.mapping.map(r.pos), 1, c),
            i || r.parentOffset || r.parent.type == a || !r.node(-1).canReplace(r.index(-1), r.indexAfter(-1), Ko.from(a.create(), r.parent)) || s.setNodeMarkup(s.mapping.map(r.before()), a)),
            e(s.scrollIntoView())
        }
        return !0
    }
    function $r(t, e) {
        var n, r = t.selection, o = r.$from, i = r.to, s = o.sharedDepth(i);
        return 0 != s && (n = o.before(s),
        e && e(t.tr.setSelection(Yi.create(t.doc, n))),
        !0)
    }
    function _r(t, e) {
        return e && e(t.tr.setSelection(new ts(t.doc))),
        !0
    }
    function qr(t, e, n) {
        var r = e.nodeBefore
          , o = e.nodeAfter
          , i = e.index();
        return !!(r && o && r.type.compatibleContent(o.type)) && (!r.content.size && e.parent.canReplace(i - 1, i) ? (n && n(t.tr.delete(e.pos - r.nodeSize, e.pos).scrollIntoView()),
        !0) : !(!e.parent.canReplace(i, i + 1) || !o.isTextblock && !nt(t.doc, e.pos)) && (n && n(t.tr.clearIncompatible(e.pos, r.type, r.contentMatchAt(r.childCount)).join(e.pos).scrollIntoView()),
        !0))
    }
    function Fr(t, e, n) {
        var r, o, i = e.nodeBefore, s = e.nodeAfter;
        if (i.type.spec.isolating || s.type.spec.isolating)
            return !1;
        if (qr(t, e, n))
            return !0;
        if (e.parent.canReplace(e.index(), e.index() + 1) && (r = (o = i.contentMatchAt(i.childCount)).findWrapping(s.type)) && o.matchType(r[0] || s.type).validEnd) {
            if (n) {
                for (var a = e.pos + s.nodeSize, c = Ko.empty, l = r.length - 1; l >= 0; l--)
                    c = Ko.from(r[l].create(null, c));
                c = Ko.from(i.copy(c));
                var p = t.tr.step(new Fi(e.pos - 1,a,e.pos,a,new Qo(c,1,0),r.length,!0))
                  , u = a + 2 * r.length;
                nt(p.doc, u) && p.join(u),
                n(p.scrollIntoView())
            }
            return !0
        }
        var h = Hi.findFrom(e, 1)
          , f = h && h.$from.blockRange(h.$to)
          , d = f && G(f);
        return null != d && d >= e.depth && (n && n(t.tr.lift(f, d).scrollIntoView()),
        !0)
    }
    function Lr(t, e) {
        return function(n, r) {
            var o = n.selection
              , i = o.$from
              , s = o.$to
              , a = i.blockRange(s)
              , c = a && Q(a, t, e);
            return !!c && (r && r(n.tr.wrap(a, c).scrollIntoView()),
            !0)
        }
    }
    function jr(t, e) {
        return function(n, r) {
            var o = n.selection
              , i = o.from
              , s = o.to
              , a = !1;
            return n.doc.nodesBetween(i, s, function(r, o) {
                if (a)
                    return !1;
                if (r.isTextblock && !r.hasMarkup(t, e))
                    if (r.type == t)
                        a = !0;
                    else {
                        var i = n.doc.resolve(o)
                          , s = i.index();
                        a = i.parent.canReplaceWith(s, s + 1, t)
                    }
            }),
            !!a && (r && r(n.tr.setBlockType(i, s, t, e).scrollIntoView()),
            !0)
        }
    }
    function Jr(t, e, n) {
        for (var r = 0; r < e.length; r++) {
            var o = function(r) {
                var o = e[r]
                  , i = o.$from
                  , s = o.$to
                  , a = 0 == i.depth && t.type.allowsMarkType(n);
                if (t.nodesBetween(i.pos, s.pos, function(t) {
                    if (a)
                        return !1;
                    a = t.inlineContent && t.type.allowsMarkType(n)
                }),
                a)
                    return {
                        v: !0
                    }
            }(r);
            if (o)
                return o.v
        }
        return !1
    }
    function Wr(t, e) {
        return function(n, r) {
            var o = n.selection
              , i = o.empty
              , s = o.$cursor
              , a = o.ranges;
            if (i && !s || !Jr(n.doc, a, t))
                return !1;
            if (r)
                if (s)
                    r(t.isInSet(n.storedMarks || s.marks()) ? n.tr.removeStoredMark(t) : n.tr.addStoredMark(t.create(e)));
                else {
                    for (var c = !1, l = n.tr, p = 0; !c && p < a.length; p++) {
                        var u = a[p]
                          , h = u.$from
                          , f = u.$to;
                        c = n.doc.rangeHasMark(h.pos, f.pos, t)
                    }
                    for (var d = 0; d < a.length; d++) {
                        var m = a[d]
                          , v = m.$from
                          , g = m.$to;
                        c ? l.removeMark(v.pos, g.pos, t) : l.addMark(v.pos, g.pos, t.create(e))
                    }
                    r(l.scrollIntoView())
                }
            return !0
        }
    }
    function Kr(t, e) {
        return function(n) {
            if (!n.isGeneric)
                return t(n);
            for (var r = [], o = 0; o < n.mapping.maps.length; o++) {
                for (var i = n.mapping.maps[o], s = 0; s < r.length; s++)
                    r[s] = i.map(r[s]);
                i.forEach(function(t, e, n, o) {
                    return r.push(n, o)
                })
            }
            for (var a = [], c = 0; c < r.length; c += 2)
                for (var l = r[c], p = r[c + 1], u = n.doc.resolve(l), h = u.sharedDepth(p), f = u.node(h), d = u.indexAfter(h), m = u.after(h + 1); m <= p; ++d) {
                    var v = f.maybeChild(d);
                    if (!v)
                        break;
                    if (d && -1 == a.indexOf(m)) {
                        var g = f.child(d - 1);
                        g.type == v.type && e(g, v) && a.push(m)
                    }
                    m += v.nodeSize
                }
            a.sort(function(t, e) {
                return t - e
            });
            for (var y = a.length - 1; y >= 0; y--)
                nt(n.doc, a[y]) && n.join(a[y]);
            t(n)
        }
    }
    function Hr() {
        for (var t = arguments, e = [], n = arguments.length; n--; )
            e[n] = t[n];
        return function(t, n, r) {
            for (var o = 0; o < e.length; o++)
                if (e[o](t, n, r))
                    return !0;
            return !1
        }
    }
    function Ur(t, e) {
        var n = {};
        for (var r in t)
            n[r] = t[r];
        for (var o in e)
            n[o] = e[o];
        return n
    }
    function Gr(t, e) {
        return function(n, r) {
            var o = n.selection
              , i = o.$from
              , s = o.$to
              , a = i.blockRange(s)
              , c = !1
              , l = a;
            if (!a)
                return !1;
            if (a.depth >= 2 && i.node(a.depth - 1).type.compatibleContent(t) && 0 == a.startIndex) {
                if (0 == i.index(a.depth - 1))
                    return !1;
                var p = n.doc.resolve(a.start - 2);
                l = new ri(p,p,a.depth),
                a.endIndex < a.parent.childCount && (a = new ri(i,n.doc.resolve(s.end(a.depth)),a.depth)),
                c = !0
            }
            var u = Q(l, t, e, a);
            return !!u && (r && r(Qr(n.tr, a, u, c, t).scrollIntoView()),
            !0)
        }
    }
    function Qr(t, e, n, r, o) {
        for (var i = Ko.empty, s = n.length - 1; s >= 0; s--)
            i = Ko.from(n[s].type.create(n[s].attrs, i));
        t.step(new Fi(e.start - (r ? 2 : 0),e.end,e.start,e.end,new Qo(i,0,0),n.length,!0));
        for (var a = 0, c = 0; c < n.length; c++)
            n[c].type == o && (a = c + 1);
        for (var l = n.length - a, p = e.start + n.length - (r ? 2 : 0), u = e.parent, h = e.startIndex, f = e.endIndex, d = !0; h < f; h++,
        d = !1)
            !d && et(t.doc, p, l) && (t.split(p, l),
            p += 2 * l),
            p += u.child(h).nodeSize;
        return t
    }
    function Xr(t) {
        return function(e, n) {
            var r = e.selection
              , o = r.$from
              , i = r.$to
              , s = r.node;
            if (s && s.isBlock || o.depth < 2 || !o.sameParent(i))
                return !1;
            var a = o.node(-1);
            if (a.type != t)
                return !1;
            if (0 == o.parent.content.size) {
                if (2 == o.depth || o.node(-3).type != t || o.index(-2) != o.node(-2).childCount - 1)
                    return !1;
                if (n) {
                    for (var c = Ko.empty, l = o.index(-1) > 0, p = o.depth - (l ? 1 : 2); p >= o.depth - 3; p--)
                        c = Ko.from(o.node(p).copy(c));
                    c = c.append(Ko.from(t.createAndFill()));
                    var u = e.tr.replace(o.before(l ? null : -1), o.after(-3), new Qo(c,l ? 3 : 2,2));
                    u.setSelection(e.selection.constructor.near(u.doc.resolve(o.pos + (l ? 3 : 2)))),
                    n(u.scrollIntoView())
                }
                return !0
            }
            var h = i.pos == o.end() ? a.contentMatchAt(0).defaultType : null
              , f = e.tr.delete(o.pos, i.pos)
              , d = h && [null, {
                type: h
            }];
            return !!et(f.doc, o.pos, 2, d) && (n && n(f.split(o.pos, 2, d).scrollIntoView()),
            !0)
        }
    }
    function Yr(t) {
        return function(e, n) {
            var r = e.selection
              , o = r.$from
              , i = r.$to
              , s = o.blockRange(i, function(e) {
                return e.childCount && e.firstChild.type == t
            });
            return !!s && (!n || (o.node(s.depth - 1).type == t ? Zr(e, n, t, s) : to(e, n, s)))
        }
    }
    function Zr(t, e, n, r) {
        var o = t.tr
          , i = r.end
          , s = r.$to.end(r.depth);
        return i < s && (o.step(new Fi(i - 1,s,i,s,new Qo(Ko.from(n.create(null, r.parent.copy())),1,0),1,!0)),
        r = new ri(o.doc.resolve(r.$from.pos),o.doc.resolve(s),r.depth)),
        e(o.lift(r, G(r)).scrollIntoView()),
        !0
    }
    function to(t, e, n) {
        for (var r = t.tr, o = n.parent, i = n.end, s = n.endIndex - 1, a = n.startIndex; s > a; s--)
            i -= o.child(s).nodeSize,
            r.delete(i - 1, i + 1);
        var c = r.doc.resolve(n.start)
          , l = c.nodeAfter
          , p = 0 == n.startIndex
          , u = n.endIndex == o.childCount
          , h = c.node(-1)
          , f = c.index(-1);
        if (!h.canReplace(f + (p ? 0 : 1), f + 1, l.content.append(u ? Ko.empty : Ko.from(o))))
            return !1;
        var d = c.pos
          , m = d + l.nodeSize;
        return r.step(new Fi(d - (p ? 1 : 0),m + (u ? 1 : 0),d + 1,m - 1,new Qo((p ? Ko.empty : Ko.from(o.copy(Ko.empty))).append(u ? Ko.empty : Ko.from(o.copy(Ko.empty))),p ? 0 : 1,u ? 0 : 1),p ? 0 : 1)),
        e(r.scrollIntoView()),
        !0
    }
    function eo(t) {
        return function(e, n) {
            var r = e.selection
              , o = r.$from
              , i = r.$to
              , s = o.blockRange(i, function(e) {
                return e.childCount && e.firstChild.type == t
            });
            if (!s)
                return !1;
            var a = s.startIndex;
            if (0 == a)
                return !1;
            var c = s.parent
              , l = c.child(a - 1);
            if (l.type != t)
                return !1;
            if (n) {
                var p = l.lastChild && l.lastChild.type == c.type
                  , u = Ko.from(p ? t.create() : null)
                  , h = new Qo(Ko.from(t.create(null, Ko.from(c.type.create(null, u)))),p ? 3 : 1,0)
                  , f = s.start
                  , d = s.end;
                n(e.tr.step(new Fi(f - (p ? 3 : 1),d,f,d,h,1,!0)).scrollIntoView())
            }
            return !0
        }
    }
    function no(t) {
        return void 0 === t && (t = {}),
        new ps({
            view: function(e) {
                return new Tc(e,t)
            }
        })
    }
    function ro(t) {
        for (var e = t.depth; e >= 0; e--) {
            var n = t.index(e);
            if (0 != n)
                for (var r = t.node(e).child(n - 1); ; r = r.lastChild) {
                    if (0 == r.childCount && !r.inlineContent || r.isAtom || r.type.spec.isolating)
                        return !0;
                    if (r.inlineContent)
                        return !1
                }
        }
        return !0
    }
    function oo(t) {
        for (var e = t.depth; e >= 0; e--) {
            var n = t.indexAfter(e)
              , r = t.node(e);
            if (n != r.childCount)
                for (var o = r.child(n); ; o = o.firstChild) {
                    if (0 == o.childCount && !o.inlineContent || o.isAtom || o.type.spec.isolating)
                        return !0;
                    if (o.inlineContent)
                        return !1
                }
        }
        return !0
    }
    function io(t, e) {
        var n = "vert" == t ? e > 0 ? "down" : "up" : e > 0 ? "right" : "left";
        return function(t, r, o) {
            var i = t.selection
              , s = e > 0 ? i.$to : i.$from
              , a = i.empty;
            if (i instanceof Qi) {
                if (!o.endOfTextblock(n))
                    return !1;
                a = !1,
                s = t.doc.resolve(e > 0 ? s.after() : s.before())
            }
            var c = Ec.findFrom(s, e, a);
            return !!c && (r && r(t.tr.setSelection(new Ec(c))),
            !0)
        }
    }
    function so(t, e, n) {
        if (!t.editable)
            return !1;
        var r = t.state.doc.resolve(e);
        if (!Ec.valid(r))
            return !1;
        var o = t.posAtCoords({
            left: n.clientX,
            top: n.clientY
        }).inside;
        return !(o > -1 && Yi.isSelectable(t.state.doc.nodeAt(o))) && (t.dispatch(t.state.tr.setSelection(new Ec(r))),
        !0)
    }
    function ao(t) {
        if (!(t.selection instanceof Ec))
            return null;
        var e = document.createElement("div");
        return e.className = "ProseMirror-gapcursor",
        fa.create(t.doc, [la.widget(t.selection.head, e, {
            key: "gapcursor"
        })])
    }
    function co(t) {
        for (var e = 0, n = 0; n < t.length; n++)
            e = (e << 5) - e + t.charCodeAt(n) | 0;
        return e
    }
    function lo(t) {
        var e = document.createElement("div");
        if (e.className = $c,
        t.path) {
            var n = "pm-icon-" + co(t.path).toString(16);
            document.getElementById(n) || po(n, t);
            var r = e.appendChild(document.createElementNS(Bc, "svg"));
            r.style.width = t.width / t.height + "em",
            r.appendChild(document.createElementNS(Bc, "use")).setAttributeNS(Vc, "href", /([^#]*)/.exec(document.location)[1] + "#" + n)
        } else
            t.dom ? e.appendChild(t.dom.cloneNode(!0)) : (e.appendChild(document.createElement("span")).textContent = t.text || "",
            t.css && (e.firstChild.style.cssText = t.css));
        return e
    }
    function po(t, e) {
        var n = document.getElementById($c + "-collection");
        n || ((n = document.createElementNS(Bc, "svg")).id = $c + "-collection",
        n.style.display = "none",
        document.body.insertBefore(n, document.body.firstChild));
        var r = document.createElementNS(Bc, "symbol");
        r.id = t,
        r.setAttribute("viewBox", "0 0 " + e.width + " " + e.height),
        r.appendChild(document.createElementNS(Bc, "path")).setAttribute("d", e.path),
        n.appendChild(r)
    }
    function uo(t, e) {
        return t._props.translate ? t._props.translate(e) : e
    }
    function ho(t) {
        Fc.time = Date.now(),
        Fc.node = t.target
    }
    function fo(t) {
        return Date.now() - 100 < Fc.time && Fc.node && t.contains(Fc.node)
    }
    function mo(t, e) {
        for (var n = [], r = [], o = 0; o < t.length; o++) {
            var i = t[o].render(e)
              , s = i.dom
              , a = i.update;
            n.push(Pc("div", {
                class: _c + "-dropdown-item"
            }, s)),
            r.push(a)
        }
        return {
            dom: n,
            update: vo(r, n)
        }
    }
    function vo(t, e) {
        return function(n) {
            for (var r = !1, o = 0; o < t.length; o++) {
                var i = t[o](n);
                e[o].style.display = i ? "" : "none",
                i && (r = !0)
            }
            return r
        }
    }
    function go(t, e) {
        for (var n = document.createDocumentFragment(), r = [], o = [], i = 0; i < e.length; i++) {
            for (var s = e[i], a = [], c = [], l = 0; l < s.length; l++) {
                var p = s[l].render(t)
                  , u = p.dom
                  , h = p.update
                  , f = Pc("span", {
                    class: _c + "item"
                }, u);
                n.appendChild(f),
                c.push(f),
                a.push(h)
            }
            a.length && (r.push(vo(a, c)),
            i < e.length - 1 && o.push(n.appendChild(yo())))
        }
        return {
            dom: n,
            update: function(t) {
                for (var e = !1, n = !1, i = 0; i < r.length; i++) {
                    var s = r[i](t);
                    i && (o[i - 1].style.display = n && s ? "" : "none"),
                    n = s,
                    s && (e = !0)
                }
                return e
            }
        }
    }
    function yo() {
        return Pc("span", {
            class: _c + "separator"
        })
    }
    function wo(t, e) {
        var n = {
            run: function(n, r) {
                return Lr(t, e.attrs)(n, r)
            },
            select: function(n) {
                return Lr(t, e.attrs instanceof Function ? null : e.attrs)(n)
            }
        };
        for (var r in e)
            n[r] = e[r];
        return new qc(n)
    }
    function bo(t, e) {
        var n = jr(t, e.attrs)
          , r = {
            run: n,
            enable: function(t) {
                return n(t)
            },
            active: function(n) {
                var r = n.selection
                  , o = r.$from
                  , i = r.to
                  , s = r.node;
                return s ? s.hasMarkup(t, e.attrs) : i <= o.end() && o.parent.hasMarkup(t, e.attrs)
            }
        };
        for (var o in e)
            r[o] = e[o];
        return new qc(r)
    }
    function ko(t, e, n) {
        n ? t.classList.add(e) : t.classList.remove(e)
    }
    function xo() {
        if ("undefined" == typeof navigator)
            return !1;
        var t = navigator.userAgent;
        return !/Edge\/\d/.test(t) && /AppleWebKit/.test(t) && /Mobile\/\w+/.test(t)
    }
    function So(t) {
        return new ps({
            view: function(e) {
                return new Xc(e,t)
            }
        })
    }
    function Mo(t) {
        return t.anchorNode == t.focusNode ? t.anchorOffset > t.focusOffset : t.anchorNode.compareDocumentPosition(t.focusNode) == Node.DOCUMENT_POSITION_FOLLOWING
    }
    function Co(t) {
        for (var e = t.parentNode; e; e = e.parentNode)
            if (e.scrollHeight > e.clientHeight)
                return e
    }
    function Oo(t) {
        for (var e = [window], n = t.parentNode; n; n = n.parentNode)
            e.push(n);
        return e
    }
    function No(t) {
        var e = document.body.appendChild(document.createElement("div"));
        e.className = Zc;
        var n = function(t) {
            e.contains(t.target) || r()
        };
        setTimeout(function() {
            return window.addEventListener("mousedown", n)
        }, 50);
        var r = function() {
            window.removeEventListener("mousedown", n),
            e.parentNode && e.parentNode.removeChild(e)
        }
          , o = [];
        for (var i in t.fields)
            o.push(t.fields[i].render());
        var s = document.createElement("button");
        s.type = "submit",
        s.className = Zc + "-submit",
        s.textContent = "OK";
        var a = document.createElement("button");
        a.type = "button",
        a.className = Zc + "-cancel",
        a.textContent = "Cancel",
        a.addEventListener("click", r);
        var c = e.appendChild(document.createElement("form"));
        t.title && (c.appendChild(document.createElement("h5")).textContent = t.title),
        o.forEach(function(t) {
            c.appendChild(document.createElement("div")).appendChild(t)
        });
        var l = c.appendChild(document.createElement("div"));
        l.className = Zc + "-buttons",
        l.appendChild(s),
        l.appendChild(document.createTextNode(" ")),
        l.appendChild(a);
        var p = e.getBoundingClientRect();
        e.style.top = (window.innerHeight - p.height) / 2 + "px",
        e.style.left = (window.innerWidth - p.width) / 2 + "px";
        var u = function() {
            var e = To(t.fields, o);
            e && (r(),
            t.callback(e))
        };
        c.addEventListener("submit", function(t) {
            t.preventDefault(),
            u()
        }),
        c.addEventListener("keydown", function(t) {
            27 == t.keyCode ? (t.preventDefault(),
            r()) : 13 != t.keyCode || t.ctrlKey || t.metaKey || t.shiftKey ? 9 == t.keyCode && window.setTimeout(function() {
                e.contains(document.activeElement) || r()
            }, 500) : (t.preventDefault(),
            u())
        });
        var h = c.elements[0];
        h && h.focus()
    }
    function To(t, e) {
        var n = Object.create(null)
          , r = 0;
        for (var o in t) {
            var i = t[o]
              , s = e[r++]
              , a = i.read(s)
              , c = i.validate(a);
            if (c)
                return Do(s, c),
                null;
            n[o] = i.clean(a)
        }
        return n
    }
    function Do(t, e) {
        var n = t.parentNode
          , r = n.appendChild(document.createElement("div"));
        r.style.left = t.offsetLeft + t.offsetWidth + 2 + "px",
        r.style.top = t.offsetTop - 5 + "px",
        r.className = "ProseMirror-invalid",
        r.textContent = e,
        setTimeout(function() {
            return n.removeChild(r)
        }, 1500)
    }
    function Eo(t, e) {
        for (var n = t.selection.$from, r = n.depth; r >= 0; r--) {
            var o = n.index(r);
            if (n.node(r).canReplaceWith(o, o, e))
                return !0
        }
        return !1
    }
    function Ao(t) {
        return new qc({
            title: "Insert image",
            label: "Image",
            enable: function(e) {
                return Eo(e, t)
            },
            run: function(e, n, r) {
                var o = e.selection
                  , i = o.from
                  , s = o.to
                  , a = null;
                e.selection instanceof Yi && e.selection.node.type == t && (a = e.selection.node.attrs),
                No({
                    title: "Insert image",
                    fields: {
                        src: new el({
                            label: "Location",
                            required: !0,
                            value: a && a.src
                        }),
                        title: new el({
                            label: "Title",
                            value: a && a.title
                        }),
                        alt: new el({
                            label: "Description",
                            value: a ? a.alt : e.doc.textBetween(i, s, " ")
                        })
                    },
                    callback: function(e) {
                        r.dispatch(r.state.tr.replaceSelectionWith(t.createAndFill(e))),
                        r.focus()
                    }
                })
            }
        })
    }
    function Io(t, e) {
        var n = {
            label: e.title,
            run: t
        };
        for (var r in e)
            n[r] = e[r];
        return e.enable && !0 !== e.enable || e.select || (n[e.enable ? "enable" : "select"] = function(e) {
            return t(e)
        }
        ),
        new qc(n)
    }
    function Ro(t, e) {
        var n = t.selection
          , r = n.from
          , o = n.$from
          , i = n.to;
        return n.empty ? e.isInSet(t.storedMarks || o.marks()) : t.doc.rangeHasMark(r, i, e)
    }
    function zo(t, e) {
        var n = {
            active: function(e) {
                return Ro(e, t)
            },
            enable: !0
        };
        for (var r in e)
            n[r] = e[r];
        return Io(Wr(t), n)
    }
    function Po(t) {
        return new qc({
            title: "Add or remove link",
            icon: Jc.link,
            active: function(e) {
                return Ro(e, t)
            },
            enable: function(t) {
                return !t.selection.empty
            },
            run: function(e, n, r) {
                if (Ro(e, t))
                    return Wr(t)(e, n),
                    !0;
                No({
                    title: "Create a link",
                    fields: {
                        href: new el({
                            label: "Link target",
                            required: !0
                        }),
                        title: new el({
                            label: "Title"
                        })
                    },
                    callback: function(e) {
                        Wr(t, e)(r.state, r.dispatch),
                        r.focus()
                    }
                })
            }
        })
    }
    function Bo(t, e) {
        return Io(Gr(t, e.attrs), e)
    }
    function Vo(t) {
        var e, n = {};
        if ((e = t.marks.strong) && (n.toggleStrong = zo(e, {
            title: "Toggle strong style",
            icon: Jc.strong
        })),
        (e = t.marks.em) && (n.toggleEm = zo(e, {
            title: "Toggle emphasis",
            icon: Jc.em
        })),
        (e = t.marks.code) && (n.toggleCode = zo(e, {
            title: "Toggle code font",
            icon: Jc.code
        })),
        (e = t.marks.link) && (n.toggleLink = Po(e)),
        (e = t.nodes.image) && (n.insertImage = Ao(e)),
        (e = t.nodes.bullet_list) && (n.wrapBulletList = Bo(e, {
            title: "Wrap in bullet list",
            icon: Jc.bulletList
        })),
        (e = t.nodes.ordered_list) && (n.wrapOrderedList = Bo(e, {
            title: "Wrap in ordered list",
            icon: Jc.orderedList
        })),
        (e = t.nodes.blockquote) && (n.wrapBlockQuote = wo(e, {
            title: "Wrap in block quote",
            icon: Jc.blockquote
        })),
        (e = t.nodes.paragraph) && (n.makeParagraph = bo(e, {
            title: "Change to paragraph",
            label: "Plain"
        })),
        (e = t.nodes.code_block) && (n.makeCodeBlock = bo(e, {
            title: "Change to code block",
            label: "Code"
        })),
        e = t.nodes.heading)
            for (var r = 1; r <= 10; r++)
                n["makeHead" + r] = bo(e, {
                    title: "Change to heading " + r,
                    label: "Level " + r,
                    attrs: {
                        level: r
                    }
                });
        if (e = t.nodes.horizontal_rule) {
            var o = e;
            n.insertHorizontalRule = new qc({
                title: "Insert horizontal rule",
                label: "Horizontal rule",
                enable: function(t) {
                    return Eo(t, o)
                },
                run: function(t, e) {
                    e(t.tr.replaceSelectionWith(o.create()))
                }
            })
        }
        var i = function(t) {
            return t.filter(function(t) {
                return t
            })
        };
        return n.insertMenu = new Lc(i([n.insertImage, n.insertHorizontalRule]),{
            label: "Insert"
        }),
        n.typeMenu = new Lc(i([n.makeParagraph, n.makeCodeBlock, n.makeHead1 && new jc(i([n.makeHead1, n.makeHead2, n.makeHead3, n.makeHead4, n.makeHead5, n.makeHead6]),{
            label: "Heading"
        })]),{
            label: "Type..."
        }),
        n.inlineMenu = [i([n.toggleStrong, n.toggleEm, n.toggleCode, n.toggleLink])],
        n.blockMenu = [i([n.wrapBulletList, n.wrapOrderedList, n.wrapBlockQuote, Wc, Kc, Hc])],
        n.fullMenu = n.inlineMenu.concat([[n.insertMenu, n.typeMenu]], [[Uc, Gc]], n.blockMenu),
        n
    }
    function $o(t, e) {
        function n(t, n) {
            if (e) {
                var r = e[t];
                if (!1 === r)
                    return;
                r && (t = r)
            }
            o[t] = n
        }
        var r, o = {};
        if (n("Mod-z", br),
        n("Shift-Mod-z", kr),
        n("Backspace", lr),
        nl || n("Mod-y", kr),
        n("Alt-ArrowUp", Er),
        n("Alt-ArrowDown", Ar),
        n("Mod-BracketLeft", Ir),
        n("Escape", $r),
        (r = t.marks.strong) && (n("Mod-b", Wr(r)),
        n("Mod-B", Wr(r))),
        (r = t.marks.em) && (n("Mod-i", Wr(r)),
        n("Mod-I", Wr(r))),
        (r = t.marks.code) && n("Mod-`", Wr(r)),
        (r = t.nodes.bullet_list) && n("Shift-Ctrl-8", Gr(r)),
        (r = t.nodes.ordered_list) && n("Shift-Ctrl-9", Gr(r)),
        (r = t.nodes.blockquote) && n("Ctrl->", Lr(r)),
        r = t.nodes.hard_break) {
            var i = r
              , s = Hr(zr, function(t, e) {
                return e(t.tr.replaceSelectionWith(i.create()).scrollIntoView()),
                !0
            });
            n("Mod-Enter", s),
            n("Shift-Enter", s),
            nl && n("Ctrl-Enter", s)
        }
        if ((r = t.nodes.list_item) && (n("Enter", Xr(r)),
        n("Mod-[", Yr(r)),
        n("Mod-]", eo(r))),
        (r = t.nodes.paragraph) && n("Shift-Ctrl-0", jr(r)),
        (r = t.nodes.code_block) && n("Shift-Ctrl-\\", jr(r)),
        r = t.nodes.heading)
            for (var a = 1; a <= 6; a++)
                n("Shift-Ctrl-" + a, jr(r, {
                    level: a
                }));
        if (r = t.nodes.horizontal_rule) {
            var c = r;
            n("Mod-_", function(t, e) {
                return e(t.tr.replaceSelectionWith(c.create()).scrollIntoView()),
                !0
            })
        }
        return o
    }
    function _o(t) {
        return pr(/^\s*>\s$/, t)
    }
    function qo(t) {
        return pr(/^(\d+)\.\s$/, t, function(t) {
            return {
                order: +t[1]
            }
        }, function(t, e) {
            return e.childCount + e.attrs.order == +t[1]
        })
    }
    function Fo(t) {
        return pr(/^\s*([-+*])\s$/, t)
    }
    function Lo(t) {
        return ur(/^```$/, t)
    }
    function jo(t, e) {
        return ur(new RegExp("^(#{1," + e + "})\\s$"), t, function(t) {
            return {
                level: t[1].length
            }
        })
    }
    function Jo(t) {
        var e, n = Fa.concat(Ba, Pa);
        return (e = t.nodes.blockquote) && n.push(_o(e)),
        (e = t.nodes.ordered_list) && n.push(qo(e)),
        (e = t.nodes.bullet_list) && n.push(Fo(e)),
        (e = t.nodes.code_block) && n.push(Lo(e)),
        (e = t.nodes.heading) && n.push(jo(e, 6)),
        ar({
            rules: n
        })
    }
    t.prototype = {
        constructor: t,
        find: function(t) {
            for (var e = this, n = 0; n < this.content.length; n += 2)
                if (e.content[n] === t)
                    return n;
            return -1
        },
        get: function(t) {
            var e = this.find(t);
            return -1 == e ? void 0 : this.content[e + 1]
        },
        update: function(e, n, r) {
            var o = r && r != e ? this.remove(r) : this
              , i = o.find(e)
              , s = o.content.slice();
            return -1 == i ? s.push(r || e, n) : (s[i + 1] = n,
            r && (s[i] = r)),
            new t(s)
        },
        remove: function(e) {
            var n = this.find(e);
            if (-1 == n)
                return this;
            var r = this.content.slice();
            return r.splice(n, 2),
            new t(r)
        },
        addToStart: function(e, n) {
            return new t([e, n].concat(this.remove(e).content))
        },
        addToEnd: function(e, n) {
            var r = this.remove(e).content.slice();
            return r.push(e, n),
            new t(r)
        },
        addBefore: function(e, n, r) {
            var o = this.remove(n)
              , i = o.content.slice()
              , s = o.find(e);
            return i.splice(-1 == s ? i.length : s, 0, n, r),
            new t(i)
        },
        forEach: function(t) {
            for (var e = this, n = 0; n < this.content.length; n += 2)
                t(e.content[n], e.content[n + 1])
        },
        prepend: function(e) {
            return (e = t.from(e)).size ? new t(e.content.concat(this.subtract(e).content)) : this
        },
        append: function(e) {
            return (e = t.from(e)).size ? new t(this.subtract(e).content.concat(e.content)) : this
        },
        subtract: function(e) {
            var n = this;
            e = t.from(e);
            for (var r = 0; r < e.content.length; r += 2)
                n = n.remove(e.content[r]);
            return n
        },
        get size() {
            return this.content.length >> 1
        }
    },
    t.from = function(e) {
        if (e instanceof t)
            return e;
        var n = [];
        if (e)
            for (var r in e)
                n.push(r, e[r]);
        return new t(n)
    }
    ;
    var Wo = t
      , Ko = function(t, e) {
        var n = this;
        if (this.content = t,
        this.size = e || 0,
        null == e)
            for (var r = 0; r < t.length; r++)
                n.size += t[r].nodeSize
    }
      , Ho = {
        firstChild: {
            configurable: !0
        },
        lastChild: {
            configurable: !0
        },
        childCount: {
            configurable: !0
        }
    };
    Ko.prototype.nodesBetween = function(t, e, n, r, o) {
        var i = this;
        void 0 === r && (r = 0);
        for (var s = 0, a = 0; a < e; s++) {
            var c = i.content[s]
              , l = a + c.nodeSize;
            if (l > t && !1 !== n(c, r + a, o, s) && c.content.size) {
                var p = a + 1;
                c.nodesBetween(Math.max(0, t - p), Math.min(c.content.size, e - p), n, r + p)
            }
            a = l
        }
    }
    ,
    Ko.prototype.descendants = function(t) {
        this.nodesBetween(0, this.size, t)
    }
    ,
    Ko.prototype.textBetween = function(t, e, n, r) {
        var o = ""
          , i = !0;
        return this.nodesBetween(t, e, function(s, a) {
            s.isText ? (o += s.text.slice(Math.max(t, a) - a, e - a),
            i = !n) : s.isLeaf && r ? (o += r,
            i = !n) : !i && s.isBlock && (o += n,
            i = !0)
        }, 0),
        o
    }
    ,
    Ko.prototype.append = function(t) {
        if (!t.size)
            return this;
        if (!this.size)
            return t;
        var e = this.lastChild
          , n = t.firstChild
          , r = this.content.slice()
          , o = 0;
        for (e.isText && e.sameMarkup(n) && (r[r.length - 1] = e.withText(e.text + n.text),
        o = 1); o < t.content.length; o++)
            r.push(t.content[o]);
        return new Ko(r,this.size + t.size)
    }
    ,
    Ko.prototype.cut = function(t, e) {
        var n = this;
        if (null == e && (e = this.size),
        0 == t && e == this.size)
            return this;
        var r = []
          , o = 0;
        if (e > t)
            for (var i = 0, s = 0; s < e; i++) {
                var a = n.content[i]
                  , c = s + a.nodeSize;
                c > t && ((s < t || c > e) && (a = a.isText ? a.cut(Math.max(0, t - s), Math.min(a.text.length, e - s)) : a.cut(Math.max(0, t - s - 1), Math.min(a.content.size, e - s - 1))),
                r.push(a),
                o += a.nodeSize),
                s = c
            }
        return new Ko(r,o)
    }
    ,
    Ko.prototype.cutByIndex = function(t, e) {
        return t == e ? Ko.empty : 0 == t && e == this.content.length ? this : new Ko(this.content.slice(t, e))
    }
    ,
    Ko.prototype.replaceChild = function(t, e) {
        var n = this.content[t];
        if (n == e)
            return this;
        var r = this.content.slice()
          , o = this.size + e.nodeSize - n.nodeSize;
        return r[t] = e,
        new Ko(r,o)
    }
    ,
    Ko.prototype.addToStart = function(t) {
        return new Ko([t].concat(this.content),this.size + t.nodeSize)
    }
    ,
    Ko.prototype.addToEnd = function(t) {
        return new Ko(this.content.concat(t),this.size + t.nodeSize)
    }
    ,
    Ko.prototype.eq = function(t) {
        var e = this;
        if (this.content.length != t.content.length)
            return !1;
        for (var n = 0; n < this.content.length; n++)
            if (!e.content[n].eq(t.content[n]))
                return !1;
        return !0
    }
    ,
    Ho.firstChild.get = function() {
        return this.content.length ? this.content[0] : null
    }
    ,
    Ho.lastChild.get = function() {
        return this.content.length ? this.content[this.content.length - 1] : null
    }
    ,
    Ho.childCount.get = function() {
        return this.content.length
    }
    ,
    Ko.prototype.child = function(t) {
        var e = this.content[t];
        if (!e)
            throw new RangeError("Index " + t + " out of range for " + this);
        return e
    }
    ,
    Ko.prototype.maybeChild = function(t) {
        return this.content[t]
    }
    ,
    Ko.prototype.forEach = function(t) {
        for (var e = this, n = 0, r = 0; n < this.content.length; n++) {
            var o = e.content[n];
            t(o, r, n),
            r += o.nodeSize
        }
    }
    ,
    Ko.prototype.findDiffStart = function(t, n) {
        return void 0 === n && (n = 0),
        e(this, t, n)
    }
    ,
    Ko.prototype.findDiffEnd = function(t, e, r) {
        return void 0 === e && (e = this.size),
        void 0 === r && (r = t.size),
        n(this, t, e, r)
    }
    ,
    Ko.prototype.findIndex = function(t, e) {
        var n = this;
        if (void 0 === e && (e = -1),
        0 == t)
            return r(0, t);
        if (t == this.size)
            return r(this.content.length, t);
        if (t > this.size || t < 0)
            throw new RangeError("Position " + t + " outside of fragment (" + this + ")");
        for (var o = 0, i = 0; ; o++) {
            var s = i + n.child(o).nodeSize;
            if (s >= t)
                return s == t || e > 0 ? r(o + 1, s) : r(o, i);
            i = s
        }
    }
    ,
    Ko.prototype.toString = function() {
        return "<" + this.toStringInner() + ">"
    }
    ,
    Ko.prototype.toStringInner = function() {
        return this.content.join(", ")
    }
    ,
    Ko.prototype.toJSON = function() {
        return this.content.length ? this.content.map(function(t) {
            return t.toJSON()
        }) : null
    }
    ,
    Ko.fromJSON = function(t, e) {
        if (!e)
            return Ko.empty;
        if (!Array.isArray(e))
            throw new RangeError("Invalid input for Fragment.fromJSON");
        return new Ko(e.map(t.nodeFromJSON))
    }
    ,
    Ko.fromArray = function(t) {
        if (!t.length)
            return Ko.empty;
        for (var e, n = 0, r = 0; r < t.length; r++) {
            var o = t[r];
            n += o.nodeSize,
            r && o.isText && t[r - 1].sameMarkup(o) ? (e || (e = t.slice(0, r)),
            e[e.length - 1] = o.withText(e[e.length - 1].text + o.text)) : e && e.push(o)
        }
        return new Ko(e || t,n)
    }
    ,
    Ko.from = function(t) {
        if (!t)
            return Ko.empty;
        if (t instanceof Ko)
            return t;
        if (Array.isArray(t))
            return this.fromArray(t);
        if (t.attrs)
            return new Ko([t],t.nodeSize);
        throw new RangeError("Can not convert " + t + " to a Fragment" + (t.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""))
    }
    ,
    Object.defineProperties(Ko.prototype, Ho);
    var Uo = {
        index: 0,
        offset: 0
    };
    Ko.empty = new Ko([],0);
    var Go = function(t, e) {
        this.type = t,
        this.attrs = e
    };
    Go.prototype.addToSet = function(t) {
        for (var e, n = this, r = !1, o = 0; o < t.length; o++) {
            var i = t[o];
            if (n.eq(i))
                return t;
            if (n.type.excludes(i.type))
                e || (e = t.slice(0, o));
            else {
                if (i.type.excludes(n.type))
                    return t;
                !r && i.type.rank > n.type.rank && (e || (e = t.slice(0, o)),
                e.push(n),
                r = !0),
                e && e.push(i)
            }
        }
        return e || (e = t.slice()),
        r || e.push(this),
        e
    }
    ,
    Go.prototype.removeFromSet = function(t) {
        for (var e = this, n = 0; n < t.length; n++)
            if (e.eq(t[n]))
                return t.slice(0, n).concat(t.slice(n + 1));
        return t
    }
    ,
    Go.prototype.isInSet = function(t) {
        for (var e = this, n = 0; n < t.length; n++)
            if (e.eq(t[n]))
                return !0;
        return !1
    }
    ,
    Go.prototype.eq = function(t) {
        return this == t || this.type == t.type && o(this.attrs, t.attrs)
    }
    ,
    Go.prototype.toJSON = function() {
        var t = this
          , e = {
            type: this.type.name
        };
        for (var n in t.attrs) {
            e.attrs = t.attrs;
            break
        }
        return e
    }
    ,
    Go.fromJSON = function(t, e) {
        if (!e)
            throw new RangeError("Invalid input for Mark.fromJSON");
        var n = t.marks[e.type];
        if (!n)
            throw new RangeError("There is no mark type " + e.type + " in this schema");
        return n.create(e.attrs)
    }
    ,
    Go.sameSet = function(t, e) {
        if (t == e)
            return !0;
        if (t.length != e.length)
            return !1;
        for (var n = 0; n < t.length; n++)
            if (!t[n].eq(e[n]))
                return !1;
        return !0
    }
    ,
    Go.setFrom = function(t) {
        if (!t || 0 == t.length)
            return Go.none;
        if (t instanceof Go)
            return [t];
        var e = t.slice();
        return e.sort(function(t, e) {
            return t.type.rank - e.type.rank
        }),
        e
    }
    ,
    Go.none = [],
    i.prototype = Object.create(Error.prototype),
    i.prototype.constructor = i,
    i.prototype.name = "ReplaceError";
    var Qo = function(t, e, n) {
        this.content = t,
        this.openStart = e,
        this.openEnd = n
    }
      , Xo = {
        size: {
            configurable: !0
        }
    };
    Xo.size.get = function() {
        return this.content.size - this.openStart - this.openEnd
    }
    ,
    Qo.prototype.insertAt = function(t, e) {
        var n = a(this.content, t + this.openStart, e, null);
        return n && new Qo(n,this.openStart,this.openEnd)
    }
    ,
    Qo.prototype.removeBetween = function(t, e) {
        return new Qo(s(this.content, t + this.openStart, e + this.openStart),this.openStart,this.openEnd)
    }
    ,
    Qo.prototype.eq = function(t) {
        return this.content.eq(t.content) && this.openStart == t.openStart && this.openEnd == t.openEnd
    }
    ,
    Qo.prototype.toString = function() {
        return this.content + "(" + this.openStart + "," + this.openEnd + ")"
    }
    ,
    Qo.prototype.toJSON = function() {
        if (!this.content.size)
            return null;
        var t = {
            content: this.content.toJSON()
        };
        return this.openStart > 0 && (t.openStart = this.openStart),
        this.openEnd > 0 && (t.openEnd = this.openEnd),
        t
    }
    ,
    Qo.fromJSON = function(t, e) {
        if (!e)
            return Qo.empty;
        var n = e.openStart || 0
          , r = e.openEnd || 0;
        if ("number" != typeof n || "number" != typeof r)
            throw new RangeError("Invalid input for Slice.fromJSON");
        return new Qo(Ko.fromJSON(t, e.content),e.openStart || 0,e.openEnd || 0)
    }
    ,
    Qo.maxOpen = function(t, e) {
        void 0 === e && (e = !0);
        for (var n = 0, r = 0, o = t.firstChild; o && !o.isLeaf && (e || !o.type.spec.isolating); o = o.firstChild)
            n++;
        for (var i = t.lastChild; i && !i.isLeaf && (e || !i.type.spec.isolating); i = i.lastChild)
            r++;
        return new Qo(t,n,r)
    }
    ,
    Object.defineProperties(Qo.prototype, Xo),
    Qo.empty = new Qo(Ko.empty,0,0);
    var Yo = function(t, e, n) {
        this.pos = t,
        this.path = e,
        this.depth = e.length / 3 - 1,
        this.parentOffset = n
    }
      , Zo = {
        parent: {
            configurable: !0
        },
        doc: {
            configurable: !0
        },
        textOffset: {
            configurable: !0
        },
        nodeAfter: {
            configurable: !0
        },
        nodeBefore: {
            configurable: !0
        }
    };
    Yo.prototype.resolveDepth = function(t) {
        return null == t ? this.depth : t < 0 ? this.depth + t : t
    }
    ,
    Zo.parent.get = function() {
        return this.node(this.depth)
    }
    ,
    Zo.doc.get = function() {
        return this.node(0)
    }
    ,
    Yo.prototype.node = function(t) {
        return this.path[3 * this.resolveDepth(t)]
    }
    ,
    Yo.prototype.index = function(t) {
        return this.path[3 * this.resolveDepth(t) + 1]
    }
    ,
    Yo.prototype.indexAfter = function(t) {
        return t = this.resolveDepth(t),
        this.index(t) + (t != this.depth || this.textOffset ? 1 : 0)
    }
    ,
    Yo.prototype.start = function(t) {
        return 0 == (t = this.resolveDepth(t)) ? 0 : this.path[3 * t - 1] + 1
    }
    ,
    Yo.prototype.end = function(t) {
        return t = this.resolveDepth(t),
        this.start(t) + this.node(t).content.size
    }
    ,
    Yo.prototype.before = function(t) {
        if (!(t = this.resolveDepth(t)))
            throw new RangeError("There is no position before the top-level node");
        return t == this.depth + 1 ? this.pos : this.path[3 * t - 1]
    }
    ,
    Yo.prototype.after = function(t) {
        if (!(t = this.resolveDepth(t)))
            throw new RangeError("There is no position after the top-level node");
        return t == this.depth + 1 ? this.pos : this.path[3 * t - 1] + this.path[3 * t].nodeSize
    }
    ,
    Zo.textOffset.get = function() {
        return this.pos - this.path[this.path.length - 1]
    }
    ,
    Zo.nodeAfter.get = function() {
        var t = this.parent
          , e = this.index(this.depth);
        if (e == t.childCount)
            return null;
        var n = this.pos - this.path[this.path.length - 1]
          , r = t.child(e);
        return n ? t.child(e).cut(n) : r
    }
    ,
    Zo.nodeBefore.get = function() {
        var t = this.index(this.depth)
          , e = this.pos - this.path[this.path.length - 1];
        return e ? this.parent.child(t).cut(0, e) : 0 == t ? null : this.parent.child(t - 1)
    }
    ,
    Yo.prototype.marks = function() {
        var t = this.parent
          , e = this.index();
        if (0 == t.content.size)
            return Go.none;
        if (this.textOffset)
            return t.child(e).marks;
        var n = t.maybeChild(e - 1)
          , r = t.maybeChild(e);
        if (!n) {
            var o = n;
            n = r,
            r = o
        }
        for (var i = n.marks, s = 0; s < i.length; s++)
            !1 !== i[s].type.spec.inclusive || r && i[s].isInSet(r.marks) || (i = i[s--].removeFromSet(i));
        return i
    }
    ,
    Yo.prototype.marksAcross = function(t) {
        var e = this.parent.maybeChild(this.index());
        if (!e || !e.isInline)
            return null;
        for (var n = e.marks, r = t.parent.maybeChild(t.index()), o = 0; o < n.length; o++)
            !1 !== n[o].type.spec.inclusive || r && n[o].isInSet(r.marks) || (n = n[o--].removeFromSet(n));
        return n
    }
    ,
    Yo.prototype.sharedDepth = function(t) {
        for (var e = this, n = this.depth; n > 0; n--)
            if (e.start(n) <= t && e.end(n) >= t)
                return n;
        return 0
    }
    ,
    Yo.prototype.blockRange = function(t, e) {
        var n = this;
        if (void 0 === t && (t = this),
        t.pos < this.pos)
            return t.blockRange(this);
        for (var r = this.depth - (this.parent.inlineContent || this.pos == t.pos ? 1 : 0); r >= 0; r--)
            if (t.pos <= n.end(r) && (!e || e(n.node(r))))
                return new ri(n,t,r)
    }
    ,
    Yo.prototype.sameParent = function(t) {
        return this.pos - this.parentOffset == t.pos - t.parentOffset
    }
    ,
    Yo.prototype.max = function(t) {
        return t.pos > this.pos ? t : this
    }
    ,
    Yo.prototype.min = function(t) {
        return t.pos < this.pos ? t : this
    }
    ,
    Yo.prototype.toString = function() {
        for (var t = this, e = "", n = 1; n <= this.depth; n++)
            e += (e ? "/" : "") + t.node(n).type.name + "_" + t.index(n - 1);
        return e + ":" + this.parentOffset
    }
    ,
    Yo.resolve = function(t, e) {
        if (!(e >= 0 && e <= t.content.size))
            throw new RangeError("Position " + e + " out of range");
        for (var n = [], r = 0, o = e, i = t; ; ) {
            var s = i.content.findIndex(o)
              , a = s.index
              , c = s.offset
              , l = o - c;
            if (n.push(i, a, r + c),
            !l)
                break;
            if ((i = i.child(a)).isText)
                break;
            o = l - 1,
            r += c + 1
        }
        return new Yo(e,n,o)
    }
    ,
    Yo.resolveCached = function(t, e) {
        for (var n = 0; n < ti.length; n++) {
            var r = ti[n];
            if (r.pos == e && r.doc == t)
                return r
        }
        var o = ti[ei] = Yo.resolve(t, e);
        return ei = (ei + 1) % ni,
        o
    }
    ,
    Object.defineProperties(Yo.prototype, Zo);
    var ti = []
      , ei = 0
      , ni = 12
      , ri = function(t, e, n) {
        this.$from = t,
        this.$to = e,
        this.depth = n
    }
      , oi = {
        start: {
            configurable: !0
        },
        end: {
            configurable: !0
        },
        parent: {
            configurable: !0
        },
        startIndex: {
            configurable: !0
        },
        endIndex: {
            configurable: !0
        }
    };
    oi.start.get = function() {
        return this.$from.before(this.depth + 1)
    }
    ,
    oi.end.get = function() {
        return this.$to.after(this.depth + 1)
    }
    ,
    oi.parent.get = function() {
        return this.$from.node(this.depth)
    }
    ,
    oi.startIndex.get = function() {
        return this.$from.index(this.depth)
    }
    ,
    oi.endIndex.get = function() {
        return this.$to.indexAfter(this.depth)
    }
    ,
    Object.defineProperties(ri.prototype, oi);
    var ii = Object.create(null)
      , si = function(t, e, n, r) {
        this.type = t,
        this.attrs = e,
        this.content = n || Ko.empty,
        this.marks = r || Go.none
    }
      , ai = {
        nodeSize: {
            configurable: !0
        },
        childCount: {
            configurable: !0
        },
        textContent: {
            configurable: !0
        },
        firstChild: {
            configurable: !0
        },
        lastChild: {
            configurable: !0
        },
        isBlock: {
            configurable: !0
        },
        isTextblock: {
            configurable: !0
        },
        inlineContent: {
            configurable: !0
        },
        isInline: {
            configurable: !0
        },
        isText: {
            configurable: !0
        },
        isLeaf: {
            configurable: !0
        },
        isAtom: {
            configurable: !0
        }
    };
    ai.nodeSize.get = function() {
        return this.isLeaf ? 1 : 2 + this.content.size
    }
    ,
    ai.childCount.get = function() {
        return this.content.childCount
    }
    ,
    si.prototype.child = function(t) {
        return this.content.child(t)
    }
    ,
    si.prototype.maybeChild = function(t) {
        return this.content.maybeChild(t)
    }
    ,
    si.prototype.forEach = function(t) {
        this.content.forEach(t)
    }
    ,
    si.prototype.nodesBetween = function(t, e, n, r) {
        void 0 === r && (r = 0),
        this.content.nodesBetween(t, e, n, r, this)
    }
    ,
    si.prototype.descendants = function(t) {
        this.nodesBetween(0, this.content.size, t)
    }
    ,
    ai.textContent.get = function() {
        return this.textBetween(0, this.content.size, "")
    }
    ,
    si.prototype.textBetween = function(t, e, n, r) {
        return this.content.textBetween(t, e, n, r)
    }
    ,
    ai.firstChild.get = function() {
        return this.content.firstChild
    }
    ,
    ai.lastChild.get = function() {
        return this.content.lastChild
    }
    ,
    si.prototype.eq = function(t) {
        return this == t || this.sameMarkup(t) && this.content.eq(t.content)
    }
    ,
    si.prototype.sameMarkup = function(t) {
        return this.hasMarkup(t.type, t.attrs, t.marks)
    }
    ,
    si.prototype.hasMarkup = function(t, e, n) {
        return this.type == t && o(this.attrs, e || t.defaultAttrs || ii) && Go.sameSet(this.marks, n || Go.none)
    }
    ,
    si.prototype.copy = function(t) {
        return void 0 === t && (t = null),
        t == this.content ? this : new this.constructor(this.type,this.attrs,t,this.marks)
    }
    ,
    si.prototype.mark = function(t) {
        return t == this.marks ? this : new this.constructor(this.type,this.attrs,this.content,t)
    }
    ,
    si.prototype.cut = function(t, e) {
        return 0 == t && e == this.content.size ? this : this.copy(this.content.cut(t, e))
    }
    ,
    si.prototype.slice = function(t, e, n) {
        if (void 0 === e && (e = this.content.size),
        void 0 === n && (n = !1),
        t == e)
            return Qo.empty;
        var r = this.resolve(t)
          , o = this.resolve(e)
          , i = n ? 0 : r.sharedDepth(e)
          , s = r.start(i)
          , a = r.node(i).content.cut(r.pos - s, o.pos - s);
        return new Qo(a,r.depth - i,o.depth - i)
    }
    ,
    si.prototype.replace = function(t, e, n) {
        return c(this.resolve(t), this.resolve(e), n)
    }
    ,
    si.prototype.nodeAt = function(t) {
        for (var e = this; ; ) {
            var n = e.content.findIndex(t)
              , r = n.index
              , o = n.offset;
            if (!(e = e.maybeChild(r)))
                return null;
            if (o == t || e.isText)
                return e;
            t -= o + 1
        }
    }
    ,
    si.prototype.childAfter = function(t) {
        var e = this.content.findIndex(t)
          , n = e.index
          , r = e.offset;
        return {
            node: this.content.maybeChild(n),
            index: n,
            offset: r
        }
    }
    ,
    si.prototype.childBefore = function(t) {
        if (0 == t)
            return {
                node: null,
                index: 0,
                offset: 0
            };
        var e = this.content.findIndex(t)
          , n = e.index
          , r = e.offset;
        if (r < t)
            return {
                node: this.content.child(n),
                index: n,
                offset: r
            };
        var o = this.content.child(n - 1);
        return {
            node: o,
            index: n - 1,
            offset: r - o.nodeSize
        }
    }
    ,
    si.prototype.resolve = function(t) {
        return Yo.resolveCached(this, t)
    }
    ,
    si.prototype.resolveNoCache = function(t) {
        return Yo.resolve(this, t)
    }
    ,
    si.prototype.rangeHasMark = function(t, e, n) {
        var r = !1;
        return e > t && this.nodesBetween(t, e, function(t) {
            return n.isInSet(t.marks) && (r = !0),
            !r
        }),
        r
    }
    ,
    ai.isBlock.get = function() {
        return this.type.isBlock
    }
    ,
    ai.isTextblock.get = function() {
        return this.type.isTextblock
    }
    ,
    ai.inlineContent.get = function() {
        return this.type.inlineContent
    }
    ,
    ai.isInline.get = function() {
        return this.type.isInline
    }
    ,
    ai.isText.get = function() {
        return this.type.isText
    }
    ,
    ai.isLeaf.get = function() {
        return this.type.isLeaf
    }
    ,
    ai.isAtom.get = function() {
        return this.type.isAtom
    }
    ,
    si.prototype.toString = function() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        var t = this.type.name;
        return this.content.size && (t += "(" + this.content.toStringInner() + ")"),
        y(this.marks, t)
    }
    ,
    si.prototype.contentMatchAt = function(t) {
        var e = this.type.contentMatch.matchFragment(this.content, 0, t);
        if (!e)
            throw new Error("Called contentMatchAt on a node with invalid content");
        return e
    }
    ,
    si.prototype.canReplace = function(t, e, n, r, o) {
        var i = this;
        void 0 === n && (n = Ko.empty),
        void 0 === r && (r = 0),
        void 0 === o && (o = n.childCount);
        var s = this.contentMatchAt(t).matchFragment(n, r, o)
          , a = s && s.matchFragment(this.content, e);
        if (!a || !a.validEnd)
            return !1;
        for (var c = r; c < o; c++)
            if (!i.type.allowsMarks(n.child(c).marks))
                return !1;
        return !0
    }
    ,
    si.prototype.canReplaceWith = function(t, e, n, r) {
        if (r && !this.type.allowsMarks(r))
            return !1;
        var o = this.contentMatchAt(t).matchType(n)
          , i = o && o.matchFragment(this.content, e);
        return !!i && i.validEnd
    }
    ,
    si.prototype.canAppend = function(t) {
        return t.content.size ? this.canReplace(this.childCount, this.childCount, t.content) : this.type.compatibleContent(t.type)
    }
    ,
    si.prototype.defaultContentType = function(t) {
        return this.contentMatchAt(t).defaultType
    }
    ,
    si.prototype.check = function() {
        if (!this.type.validContent(this.content))
            throw new RangeError("Invalid content for node " + this.type.name + ": " + this.content.toString().slice(0, 50));
        this.content.forEach(function(t) {
            return t.check()
        })
    }
    ,
    si.prototype.toJSON = function() {
        var t = this
          , e = {
            type: this.type.name
        };
        for (var n in t.attrs) {
            e.attrs = t.attrs;
            break
        }
        return this.content.size && (e.content = this.content.toJSON()),
        this.marks.length && (e.marks = this.marks.map(function(t) {
            return t.toJSON()
        })),
        e
    }
    ,
    si.fromJSON = function(t, e) {
        if (!e)
            throw new RangeError("Invalid input for Node.fromJSON");
        var n = null;
        if (e.marks) {
            if (!Array.isArray(e.marks))
                throw new RangeError("Invalid mark data for Node.fromJSON");
            n = e.marks.map(t.markFromJSON)
        }
        if ("text" == e.type) {
            if ("string" != typeof e.text)
                throw new RangeError("Invalid text node in JSON");
            return t.text(e.text, n)
        }
        var r = Ko.fromJSON(t, e.content);
        return t.nodeType(e.type).create(e.attrs, r, n)
    }
    ,
    Object.defineProperties(si.prototype, ai);
    var ci = function(t) {
        function e(e, n, r, o) {
            if (t.call(this, e, n, null, o),
            !r)
                throw new RangeError("Empty text nodes are not allowed");
            this.text = r
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            textContent: {
                configurable: !0
            },
            nodeSize: {
                configurable: !0
            }
        };
        return e.prototype.toString = function() {
            return this.type.spec.toDebugString ? this.type.spec.toDebugString(this) : y(this.marks, JSON.stringify(this.text))
        }
        ,
        n.textContent.get = function() {
            return this.text
        }
        ,
        e.prototype.textBetween = function(t, e) {
            return this.text.slice(t, e)
        }
        ,
        n.nodeSize.get = function() {
            return this.text.length
        }
        ,
        e.prototype.mark = function(t) {
            return t == this.marks ? this : new e(this.type,this.attrs,this.text,t)
        }
        ,
        e.prototype.withText = function(t) {
            return t == this.text ? this : new e(this.type,this.attrs,t,this.marks)
        }
        ,
        e.prototype.cut = function(t, e) {
            return void 0 === t && (t = 0),
            void 0 === e && (e = this.text.length),
            0 == t && e == this.text.length ? this : this.withText(this.text.slice(t, e))
        }
        ,
        e.prototype.eq = function(t) {
            return this.sameMarkup(t) && this.text == t.text
        }
        ,
        e.prototype.toJSON = function() {
            var e = t.prototype.toJSON.call(this);
            return e.text = this.text,
            e
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(si)
      , li = function(t) {
        this.validEnd = t,
        this.next = [],
        this.wrapCache = []
    }
      , pi = {
        inlineContent: {
            configurable: !0
        },
        defaultType: {
            configurable: !0
        },
        edgeCount: {
            configurable: !0
        }
    };
    li.parse = function(t, e) {
        var n = new ui(t,e);
        if (null == n.next)
            return li.empty;
        var r = w(n);
        n.next && n.err("Unexpected trailing text");
        var o = D(O(r));
        return E(o, n),
        o
    }
    ,
    li.prototype.matchType = function(t) {
        for (var e = this, n = 0; n < this.next.length; n += 2)
            if (e.next[n] == t)
                return e.next[n + 1];
        return null
    }
    ,
    li.prototype.matchFragment = function(t, e, n) {
        void 0 === e && (e = 0),
        void 0 === n && (n = t.childCount);
        for (var r = this, o = e; r && o < n; o++)
            r = r.matchType(t.child(o).type);
        return r
    }
    ,
    pi.inlineContent.get = function() {
        var t = this.next[0];
        return !!t && t.isInline
    }
    ,
    pi.defaultType.get = function() {
        for (var t = this, e = 0; e < this.next.length; e += 2) {
            var n = t.next[e];
            if (!n.isText && !n.hasRequiredAttrs())
                return n
        }
    }
    ,
    li.prototype.compatible = function(t) {
        for (var e = this, n = 0; n < this.next.length; n += 2)
            for (var r = 0; r < t.next.length; r += 2)
                if (e.next[n] == t.next[r])
                    return !0;
        return !1
    }
    ,
    li.prototype.fillBefore = function(t, e, n) {
        function r(i, s) {
            var a = i.matchFragment(t, n);
            if (a && (!e || a.validEnd))
                return Ko.from(s.map(function(t) {
                    return t.createAndFill()
                }));
            for (var c = 0; c < i.next.length; c += 2) {
                var l = i.next[c]
                  , p = i.next[c + 1];
                if (!l.isText && !l.hasRequiredAttrs() && -1 == o.indexOf(p)) {
                    o.push(p);
                    var u = r(p, s.concat(l));
                    if (u)
                        return u
                }
            }
        }
        void 0 === e && (e = !1),
        void 0 === n && (n = 0);
        var o = [this];
        return r(this, [])
    }
    ,
    li.prototype.findWrapping = function(t) {
        for (var e = this, n = 0; n < this.wrapCache.length; n += 2)
            if (e.wrapCache[n] == t)
                return e.wrapCache[n + 1];
        var r = this.computeWrapping(t);
        return this.wrapCache.push(t, r),
        r
    }
    ,
    li.prototype.computeWrapping = function(t) {
        for (var e = Object.create(null), n = [{
            match: this,
            type: null,
            via: null
        }]; n.length; ) {
            var r = n.shift()
              , o = r.match;
            if (o.matchType(t)) {
                for (var i = [], s = r; s.type; s = s.via)
                    i.push(s.type);
                return i.reverse()
            }
            for (var a = 0; a < o.next.length; a += 2) {
                var c = o.next[a];
                c.isLeaf || c.hasRequiredAttrs() || c.name in e || r.type && !o.next[a + 1].validEnd || (n.push({
                    match: c.contentMatch,
                    type: c,
                    via: r
                }),
                e[c.name] = !0)
            }
        }
    }
    ,
    pi.edgeCount.get = function() {
        return this.next.length >> 1
    }
    ,
    li.prototype.edge = function(t) {
        var e = t << 1;
        if (e >= this.next.length)
            throw new RangeError("There's no " + t + "th edge in this content match");
        return {
            type: this.next[e],
            next: this.next[e + 1]
        }
    }
    ,
    li.prototype.toString = function() {
        function t(n) {
            e.push(n);
            for (var r = 1; r < n.next.length; r += 2)
                -1 == e.indexOf(n.next[r]) && t(n.next[r])
        }
        var e = [];
        return t(this),
        e.map(function(t, n) {
            for (var r = n + (t.validEnd ? "*" : " ") + " ", o = 0; o < t.next.length; o += 2)
                r += (o ? ", " : "") + t.next[o].name + "->" + e.indexOf(t.next[o + 1]);
            return r
        }).join("\n")
    }
    ,
    Object.defineProperties(li.prototype, pi),
    li.empty = new li(!0);
    var ui = function(t, e) {
        this.string = t,
        this.nodeTypes = e,
        this.inline = null,
        this.pos = 0,
        this.tokens = t.split(/\s*(?=\b|\W|$)/),
        "" == this.tokens[this.tokens.length - 1] && this.tokens.pop(),
        "" == this.tokens[0] && this.tokens.unshift()
    }
      , hi = {
        next: {
            configurable: !0
        }
    };
    hi.next.get = function() {
        return this.tokens[this.pos]
    }
    ,
    ui.prototype.eat = function(t) {
        return this.next == t && (this.pos++ || !0)
    }
    ,
    ui.prototype.err = function(t) {
        throw new SyntaxError(t + " (in content expression '" + this.string + "')")
    }
    ,
    Object.defineProperties(ui.prototype, hi);
    var fi = function(t, e, n) {
        this.name = t,
        this.schema = e,
        this.spec = n,
        this.groups = n.group ? n.group.split(" ") : [],
        this.attrs = R(n.attrs),
        this.defaultAttrs = A(this.attrs),
        this.contentMatch = null,
        this.markSet = null,
        this.inlineContent = null,
        this.isBlock = !(n.inline || "text" == t),
        this.isText = "text" == t
    }
      , di = {
        isInline: {
            configurable: !0
        },
        isTextblock: {
            configurable: !0
        },
        isLeaf: {
            configurable: !0
        },
        isAtom: {
            configurable: !0
        }
    };
    di.isInline.get = function() {
        return !this.isBlock
    }
    ,
    di.isTextblock.get = function() {
        return this.isBlock && this.inlineContent
    }
    ,
    di.isLeaf.get = function() {
        return this.contentMatch == li.empty
    }
    ,
    di.isAtom.get = function() {
        return this.isLeaf || this.spec.atom
    }
    ,
    fi.prototype.hasRequiredAttrs = function(t) {
        var e = this;
        for (var n in e.attrs)
            if (e.attrs[n].isRequired && (!t || !(n in t)))
                return !0;
        return !1
    }
    ,
    fi.prototype.compatibleContent = function(t) {
        return this == t || this.contentMatch.compatible(t.contentMatch)
    }
    ,
    fi.prototype.computeAttrs = function(t) {
        return !t && this.defaultAttrs ? this.defaultAttrs : I(this.attrs, t)
    }
    ,
    fi.prototype.create = function(t, e, n) {
        if (this.isText)
            throw new Error("NodeType.create can't construct text nodes");
        return new si(this,this.computeAttrs(t),Ko.from(e),Go.setFrom(n))
    }
    ,
    fi.prototype.createChecked = function(t, e, n) {
        if (e = Ko.from(e),
        !this.validContent(e))
            throw new RangeError("Invalid content for node " + this.name);
        return new si(this,this.computeAttrs(t),e,Go.setFrom(n))
    }
    ,
    fi.prototype.createAndFill = function(t, e, n) {
        if (t = this.computeAttrs(t),
        (e = Ko.from(e)).size) {
            var r = this.contentMatch.fillBefore(e);
            if (!r)
                return null;
            e = r.append(e)
        }
        var o = this.contentMatch.matchFragment(e).fillBefore(Ko.empty, !0);
        return o ? new si(this,t,e.append(o),Go.setFrom(n)) : null
    }
    ,
    fi.prototype.validContent = function(t) {
        var e = this
          , n = this.contentMatch.matchFragment(t);
        if (!n || !n.validEnd)
            return !1;
        for (var r = 0; r < t.childCount; r++)
            if (!e.allowsMarks(t.child(r).marks))
                return !1;
        return !0
    }
    ,
    fi.prototype.allowsMarkType = function(t) {
        return null == this.markSet || this.markSet.indexOf(t) > -1
    }
    ,
    fi.prototype.allowsMarks = function(t) {
        var e = this;
        if (null == this.markSet)
            return !0;
        for (var n = 0; n < t.length; n++)
            if (!e.allowsMarkType(t[n].type))
                return !1;
        return !0
    }
    ,
    fi.prototype.allowedMarks = function(t) {
        var e = this;
        if (null == this.markSet)
            return t;
        for (var n, r = 0; r < t.length; r++)
            e.allowsMarkType(t[r].type) ? n && n.push(t[r]) : n || (n = t.slice(0, r));
        return n ? n.length ? n : Go.empty : t
    }
    ,
    fi.compile = function(t, e) {
        var n = Object.create(null);
        t.forEach(function(t, r) {
            return n[t] = new fi(t,e,r)
        });
        var r = e.spec.topNode || "doc";
        if (!n[r])
            throw new RangeError("Schema is missing its top node type ('" + r + "')");
        if (!n.text)
            throw new RangeError("Every schema needs a 'text' type");
        for (var o in n.text.attrs)
            throw new RangeError("The text node type should not have attributes");
        return n
    }
    ,
    Object.defineProperties(fi.prototype, di);
    var mi = function(t) {
        this.hasDefault = Object.prototype.hasOwnProperty.call(t, "default"),
        this.default = t.default
    }
      , vi = {
        isRequired: {
            configurable: !0
        }
    };
    vi.isRequired.get = function() {
        return !this.hasDefault
    }
    ,
    Object.defineProperties(mi.prototype, vi);
    var gi = function(t, e, n, r) {
        this.name = t,
        this.schema = n,
        this.spec = r,
        this.attrs = R(r.attrs),
        this.rank = e,
        this.excluded = null;
        var o = A(this.attrs);
        this.instance = o && new Go(this,o)
    };
    gi.prototype.create = function(t) {
        return !t && this.instance ? this.instance : new Go(this,I(this.attrs, t))
    }
    ,
    gi.compile = function(t, e) {
        var n = Object.create(null)
          , r = 0;
        return t.forEach(function(t, o) {
            return n[t] = new gi(t,r++,e,o)
        }),
        n
    }
    ,
    gi.prototype.removeFromSet = function(t) {
        for (var e = this, n = 0; n < t.length; n++)
            if (t[n].type == e)
                return t.slice(0, n).concat(t.slice(n + 1));
        return t
    }
    ,
    gi.prototype.isInSet = function(t) {
        for (var e = this, n = 0; n < t.length; n++)
            if (t[n].type == e)
                return t[n]
    }
    ,
    gi.prototype.excludes = function(t) {
        return this.excluded.indexOf(t) > -1
    }
    ;
    var yi = function(t) {
        var e = this;
        this.spec = {};
        for (var n in t)
            e.spec[n] = t[n];
        this.spec.nodes = Wo.from(t.nodes),
        this.spec.marks = Wo.from(t.marks),
        this.nodes = fi.compile(this.spec.nodes, this),
        this.marks = gi.compile(this.spec.marks, this);
        var r = Object.create(null);
        for (var o in e.nodes) {
            if (o in e.marks)
                throw new RangeError(o + " can not be both a node and a mark");
            var i = e.nodes[o]
              , s = i.spec.content || ""
              , a = i.spec.marks;
            i.contentMatch = r[s] || (r[s] = li.parse(s, e.nodes)),
            i.inlineContent = i.contentMatch.inlineContent,
            i.markSet = "_" == a ? null : a ? z(e, a.split(" ")) : "" != a && i.inlineContent ? null : []
        }
        for (var c in e.marks) {
            var l = e.marks[c]
              , p = l.spec.excludes;
            l.excluded = null == p ? [l] : "" == p ? [] : z(e, p.split(" "))
        }
        this.nodeFromJSON = this.nodeFromJSON.bind(this),
        this.markFromJSON = this.markFromJSON.bind(this),
        this.topNodeType = this.nodes[this.spec.topNode || "doc"],
        this.cached = Object.create(null),
        this.cached.wrappings = Object.create(null)
    };
    yi.prototype.node = function(t, e, n, r) {
        if ("string" == typeof t)
            t = this.nodeType(t);
        else {
            if (!(t instanceof fi))
                throw new RangeError("Invalid node type: " + t);
            if (t.schema != this)
                throw new RangeError("Node type from different schema used (" + t.name + ")")
        }
        return t.createChecked(e, n, r)
    }
    ,
    yi.prototype.text = function(t, e) {
        var n = this.nodes.text;
        return new ci(n,n.defaultAttrs,t,Go.setFrom(e))
    }
    ,
    yi.prototype.mark = function(t, e) {
        return "string" == typeof t && (t = this.marks[t]),
        t.create(e)
    }
    ,
    yi.prototype.nodeFromJSON = function(t) {
        return si.fromJSON(this, t)
    }
    ,
    yi.prototype.markFromJSON = function(t) {
        return Go.fromJSON(this, t)
    }
    ,
    yi.prototype.nodeType = function(t) {
        var e = this.nodes[t];
        if (!e)
            throw new RangeError("Unknown node type: " + t);
        return e
    }
    ;
    var wi = function(t, e) {
        var n = this;
        this.schema = t,
        this.rules = e,
        this.tags = [],
        this.styles = [],
        e.forEach(function(t) {
            t.tag ? n.tags.push(t) : t.style && n.styles.push(t)
        })
    };
    wi.prototype.parse = function(t, e) {
        void 0 === e && (e = {});
        var n = new Oi(this,e,!1);
        return n.addAll(t, null, e.from, e.to),
        n.finish()
    }
    ,
    wi.prototype.parseSlice = function(t, e) {
        void 0 === e && (e = {});
        var n = new Oi(this,e,!0);
        return n.addAll(t, null, e.from, e.to),
        Qo.maxOpen(n.finish())
    }
    ,
    wi.prototype.matchTag = function(t, e) {
        for (var n = this, r = 0; r < this.tags.length; r++) {
            var o = n.tags[r];
            if (V(t, o.tag) && (void 0 === o.namespace || t.namespaceURI == o.namespace) && (!o.context || e.matchesContext(o.context))) {
                if (o.getAttrs) {
                    var i = o.getAttrs(t);
                    if (!1 === i)
                        continue;
                    o.attrs = i
                }
                return o
            }
        }
    }
    ,
    wi.prototype.matchStyle = function(t, e, n) {
        for (var r = this, o = 0; o < this.styles.length; o++) {
            var i = r.styles[o];
            if (!(0 != i.style.indexOf(t) || i.context && !n.matchesContext(i.context) || i.style.length > t.length && (61 != i.style.charCodeAt(t.length) || i.style.slice(t.length + 1) != e))) {
                if (i.getAttrs) {
                    var s = i.getAttrs(e);
                    if (!1 === s)
                        continue;
                    i.attrs = s
                }
                return i
            }
        }
    }
    ,
    wi.schemaRules = function(t) {
        function e(t) {
            for (var e = null == t.priority ? 50 : t.priority, r = 0; r < n.length; r++) {
                var o = n[r];
                if ((null == o.priority ? 50 : o.priority) < e)
                    break
            }
            n.splice(r, 0, t)
        }
        var n = [];
        for (var r in t.marks)
            !function(n) {
                var r = t.marks[n].spec.parseDOM;
                r && r.forEach(function(t) {
                    e(t = _(t)),
                    t.mark = n
                })
            }(r);
        for (var o in t.nodes)
            !function(n) {
                var r = t.nodes[o].spec.parseDOM;
                r && r.forEach(function(t) {
                    e(t = _(t)),
                    t.node = o
                })
            }();
        return n
    }
    ,
    wi.fromSchema = function(t) {
        return t.cached.domParser || (t.cached.domParser = new wi(t,wi.schemaRules(t)))
    }
    ;
    var bi = {
        address: !0,
        article: !0,
        aside: !0,
        blockquote: !0,
        canvas: !0,
        dd: !0,
        div: !0,
        dl: !0,
        fieldset: !0,
        figcaption: !0,
        figure: !0,
        footer: !0,
        form: !0,
        h1: !0,
        h2: !0,
        h3: !0,
        h4: !0,
        h5: !0,
        h6: !0,
        header: !0,
        hgroup: !0,
        hr: !0,
        li: !0,
        noscript: !0,
        ol: !0,
        output: !0,
        p: !0,
        pre: !0,
        section: !0,
        table: !0,
        tfoot: !0,
        ul: !0
    }
      , ki = {
        head: !0,
        noscript: !0,
        object: !0,
        script: !0,
        style: !0,
        title: !0
    }
      , xi = {
        ol: !0,
        ul: !0
    }
      , Si = 1
      , Mi = 2
      , Ci = function(t, e, n, r, o, i) {
        this.type = t,
        this.attrs = e,
        this.solid = r,
        this.match = o || (4 & i ? null : t.contentMatch),
        this.options = i,
        this.content = [],
        this.marks = n,
        this.activeMarks = Go.none
    };
    Ci.prototype.findWrapping = function(t) {
        if (!this.match) {
            if (!this.type)
                return [];
            var e = this.type.contentMatch.fillBefore(Ko.from(t));
            if (!e) {
                var n, r = this.type.contentMatch;
                return (n = r.findWrapping(t.type)) ? (this.match = r,
                n) : null
            }
            this.match = this.type.contentMatch.matchFragment(e)
        }
        return this.match.findWrapping(t.type)
    }
    ,
    Ci.prototype.finish = function(t) {
        if (!(this.options & Si)) {
            var e, n = this.content[this.content.length - 1];
            n && n.isText && (e = /[ \t\r\n\u000c]+$/.exec(n.text)) && (n.text.length == e[0].length ? this.content.pop() : this.content[this.content.length - 1] = n.withText(n.text.slice(0, n.text.length - e[0].length)))
        }
        var r = Ko.from(this.content);
        return !t && this.match && (r = r.append(this.match.fillBefore(Ko.empty, !0))),
        this.type ? this.type.create(this.attrs, r, this.marks) : r
    }
    ;
    var Oi = function(t, e, n) {
        this.parser = t,
        this.options = e,
        this.isOpen = n,
        this.pendingMarks = [];
        var r, o = e.topNode, i = P(e.preserveWhitespace) | (n ? 4 : 0);
        r = o ? new Ci(o.type,o.attrs,Go.none,!0,e.topMatch || o.type.contentMatch,i) : n ? new Ci(null,null,Go.none,!0,null,i) : new Ci(t.schema.topNodeType,null,Go.none,!0,null,i),
        this.nodes = [r],
        this.open = 0,
        this.find = e.findPositions,
        this.needsBlock = !1
    }
      , Ni = {
        top: {
            configurable: !0
        },
        currentPos: {
            configurable: !0
        }
    };
    Ni.top.get = function() {
        return this.nodes[this.open]
    }
    ,
    Oi.prototype.addDOM = function(t) {
        var e = this;
        if (3 == t.nodeType)
            this.addTextNode(t);
        else if (1 == t.nodeType) {
            var n = t.getAttribute("style")
              , r = n ? this.readStyles($(n)) : null;
            if (null != r)
                for (var o = 0; o < r.length; o++)
                    e.addPendingMark(r[o]);
            if (this.addElement(t),
            null != r)
                for (var i = 0; i < r.length; i++)
                    e.removePendingMark(r[i])
        }
    }
    ,
    Oi.prototype.addTextNode = function(t) {
        var e = t.nodeValue
          , n = this.top;
        if ((n.type ? n.type.inlineContent : n.content.length && n.content[0].isInline) || /[^ \t\r\n\u000c]/.test(e)) {
            if (n.options & Si)
                n.options & Mi || (e = e.replace(/\r?\n|\r/g, " "));
            else if (e = e.replace(/[ \t\r\n\u000c]+/g, " "),
            /^[ \t\r\n\u000c]/.test(e) && this.open == this.nodes.length - 1) {
                var r = n.content[n.content.length - 1]
                  , o = t.previousSibling;
                (!r || o && "BR" == o.nodeName || r.isText && /[ \t\r\n\u000c]$/.test(r.text)) && (e = e.slice(1))
            }
            e && this.insertNode(this.parser.schema.text(e)),
            this.findInText(t)
        } else
            this.findInside(t)
    }
    ,
    Oi.prototype.addElement = function(t) {
        var e = t.nodeName.toLowerCase();
        xi.hasOwnProperty(e) && B(t);
        var n = this.options.ruleFromNode && this.options.ruleFromNode(t) || this.parser.matchTag(t, this);
        if (n ? n.ignore : ki.hasOwnProperty(e))
            this.findInside(t);
        else if (!n || n.skip) {
            n && n.skip.nodeType && (t = n.skip);
            var r, o = this.top, i = this.needsBlock;
            if (bi.hasOwnProperty(e))
                r = !0,
                o.type || (this.needsBlock = !0);
            else if (!t.firstChild)
                return void this.leafFallback(t);
            this.addAll(t),
            r && this.sync(o),
            this.needsBlock = i
        } else
            this.addElementByRule(t, n)
    }
    ,
    Oi.prototype.leafFallback = function(t) {
        "BR" == t.nodeName && this.top.type && this.top.type.inlineContent && this.addTextNode(t.ownerDocument.createTextNode("\n"))
    }
    ,
    Oi.prototype.readStyles = function(t) {
        for (var e = this, n = Go.none, r = 0; r < t.length; r += 2) {
            var o = e.parser.matchStyle(t[r], t[r + 1], e);
            if (o) {
                if (o.ignore)
                    return null;
                n = e.parser.schema.marks[o.mark].create(o.attrs).addToSet(n)
            }
        }
        return n
    }
    ,
    Oi.prototype.addElementByRule = function(t, e) {
        var n, r, o, i = this;
        e.node ? (r = this.parser.schema.nodes[e.node]).isLeaf ? this.insertNode(r.create(e.attrs)) || this.leafFallback(t) : n = this.enter(r, e.attrs, e.preserveWhitespace) : (o = this.parser.schema.marks[e.mark].create(e.attrs),
        this.addPendingMark(o));
        var s = this.top;
        if (r && r.isLeaf)
            this.findInside(t);
        else if (e.getContent)
            this.findInside(t),
            e.getContent(t, this.parser.schema).forEach(function(t) {
                return i.insertNode(t)
            });
        else {
            var a = e.contentElement;
            "string" == typeof a ? a = t.querySelector(a) : "function" == typeof a && (a = a(t)),
            a || (a = t),
            this.findAround(t, a, !0),
            this.addAll(a, n)
        }
        n && (this.sync(s),
        this.open--),
        o && this.removePendingMark(o)
    }
    ,
    Oi.prototype.addAll = function(t, e, n, r) {
        for (var o = this, i = n || 0, s = n ? t.childNodes[n] : t.firstChild, a = null == r ? null : t.childNodes[r]; s != a; s = s.nextSibling,
        ++i)
            o.findAtPoint(t, i),
            o.addDOM(s),
            e && bi.hasOwnProperty(s.nodeName.toLowerCase()) && o.sync(e);
        this.findAtPoint(t, i)
    }
    ,
    Oi.prototype.findPlace = function(t) {
        for (var e, n, r = this, o = this.open; o >= 0; o--) {
            var i = r.nodes[o]
              , s = i.findWrapping(t);
            if (s && (!e || e.length > s.length) && (e = s,
            n = i,
            !s.length))
                break;
            if (i.solid)
                break
        }
        if (!e)
            return !1;
        this.sync(n);
        for (var a = 0; a < e.length; a++)
            r.enterInner(e[a], null, !1);
        return !0
    }
    ,
    Oi.prototype.insertNode = function(t) {
        if (t.isInline && this.needsBlock && !this.top.type) {
            var e = this.textblockFromContext();
            e && this.enterInner(e)
        }
        if (this.findPlace(t)) {
            this.closeExtra();
            var n = this.top;
            this.applyPendingMarks(n),
            n.match && (n.match = n.match.matchType(t.type));
            for (var r = n.activeMarks, o = 0; o < t.marks.length; o++)
                n.type && !n.type.allowsMarkType(t.marks[o].type) || (r = t.marks[o].addToSet(r));
            return n.content.push(t.mark(r)),
            !0
        }
        return !1
    }
    ,
    Oi.prototype.applyPendingMarks = function(t) {
        for (var e = this, n = 0; n < this.pendingMarks.length; n++) {
            var r = e.pendingMarks[n];
            t.type && !t.type.allowsMarkType(r.type) || r.isInSet(t.activeMarks) || (t.activeMarks = r.addToSet(t.activeMarks),
            e.pendingMarks.splice(n--, 1))
        }
    }
    ,
    Oi.prototype.enter = function(t, e, n) {
        var r = this.findPlace(t.create(e));
        return r && (this.applyPendingMarks(this.top),
        this.enterInner(t, e, !0, n)),
        r
    }
    ,
    Oi.prototype.enterInner = function(t, e, n, r) {
        this.closeExtra();
        var o = this.top;
        o.match = o.match && o.match.matchType(t, e);
        var i = null == r ? -5 & o.options : P(r);
        4 & o.options && 0 == o.content.length && (i |= 4),
        this.nodes.push(new Ci(t,e,o.activeMarks,n,null,i)),
        this.open++
    }
    ,
    Oi.prototype.closeExtra = function(t) {
        var e = this
          , n = this.nodes.length - 1;
        if (n > this.open) {
            for (; n > this.open; n--)
                e.nodes[n - 1].content.push(e.nodes[n].finish(t));
            this.nodes.length = this.open + 1
        }
    }
    ,
    Oi.prototype.finish = function() {
        return this.open = 0,
        this.closeExtra(this.isOpen),
        this.nodes[0].finish(this.isOpen || this.options.topOpen)
    }
    ,
    Oi.prototype.sync = function(t) {
        for (var e = this, n = this.open; n >= 0; n--)
            if (e.nodes[n] == t)
                return void (e.open = n)
    }
    ,
    Oi.prototype.addPendingMark = function(t) {
        this.pendingMarks.push(t)
    }
    ,
    Oi.prototype.removePendingMark = function(t) {
        var e = this.pendingMarks.lastIndexOf(t);
        if (e > -1)
            this.pendingMarks.splice(e, 1);
        else {
            var n = this.top;
            n.activeMarks = t.removeFromSet(n.activeMarks)
        }
    }
    ,
    Ni.currentPos.get = function() {
        var t = this;
        this.closeExtra();
        for (var e = 0, n = this.open; n >= 0; n--) {
            for (var r = t.nodes[n].content, o = r.length - 1; o >= 0; o--)
                e += r[o].nodeSize;
            n && e++
        }
        return e
    }
    ,
    Oi.prototype.findAtPoint = function(t, e) {
        var n = this;
        if (this.find)
            for (var r = 0; r < this.find.length; r++)
                n.find[r].node == t && n.find[r].offset == e && (n.find[r].pos = n.currentPos)
    }
    ,
    Oi.prototype.findInside = function(t) {
        var e = this;
        if (this.find)
            for (var n = 0; n < this.find.length; n++)
                null == e.find[n].pos && 1 == t.nodeType && t.contains(e.find[n].node) && (e.find[n].pos = e.currentPos)
    }
    ,
    Oi.prototype.findAround = function(t, e, n) {
        var r = this;
        if (t != e && this.find)
            for (var o = 0; o < this.find.length; o++)
                null == r.find[o].pos && 1 == t.nodeType && t.contains(r.find[o].node) && e.compareDocumentPosition(r.find[o].node) & (n ? 2 : 4) && (r.find[o].pos = r.currentPos)
    }
    ,
    Oi.prototype.findInText = function(t) {
        var e = this;
        if (this.find)
            for (var n = 0; n < this.find.length; n++)
                e.find[n].node == t && (e.find[n].pos = e.currentPos - (t.nodeValue.length - e.find[n].offset))
    }
    ,
    Oi.prototype.matchesContext = function(t) {
        var e = this;
        if (t.indexOf("|") > -1)
            return t.split(/\s*\|\s*/).some(this.matchesContext, this);
        var n = t.split("/")
          , r = this.options.context
          , o = !(this.isOpen || r && r.parent.type != this.nodes[0].type)
          , i = -(r ? r.depth + 1 : 0) + (o ? 0 : 1)
          , s = function(t, a) {
            for (; t >= 0; t--) {
                var c = n[t];
                if ("" == c) {
                    if (t == n.length - 1 || 0 == t)
                        continue;
                    for (; a >= i; a--)
                        if (s(t - 1, a))
                            return !0;
                    return !1
                }
                var l = a > 0 || 0 == a && o ? e.nodes[a].type : r && a >= i ? r.node(a - i).type : null;
                if (!l || l.name != c && -1 == l.groups.indexOf(c))
                    return !1;
                a--
            }
            return !0
        };
        return s(n.length - 1, this.open)
    }
    ,
    Oi.prototype.textblockFromContext = function() {
        var t = this
          , e = this.options.context;
        if (e)
            for (var n = e.depth; n >= 0; n--) {
                var r = e.node(n).contentMatchAt(e.indexAfter(n)).defaultType;
                if (r && r.isTextblock && r.defaultAttrs)
                    return r
            }
        for (var o in t.parser.schema.nodes) {
            var i = t.parser.schema.nodes[o];
            if (i.isTextblock && i.defaultAttrs)
                return i
        }
    }
    ,
    Object.defineProperties(Oi.prototype, Ni);
    var Ti = function(t, e) {
        this.nodes = t || {},
        this.marks = e || {}
    };
    Ti.prototype.serializeFragment = function(t, e, n) {
        var r = this;
        void 0 === e && (e = {}),
        n || (n = F(e).createDocumentFragment());
        var o = n
          , i = null;
        return t.forEach(function(t) {
            if (i || t.marks.length) {
                i || (i = []);
                for (var n = 0, s = 0; n < i.length && s < t.marks.length; ) {
                    var a = t.marks[s];
                    if (r.marks[a.type.name]) {
                        if (!a.eq(i[n]) || !1 === a.type.spec.spanning)
                            break;
                        n += 2,
                        s++
                    } else
                        s++
                }
                for (; n < i.length; )
                    o = i.pop(),
                    i.pop();
                for (; s < t.marks.length; ) {
                    var c = t.marks[s++]
                      , l = r.serializeMark(c, t.isInline, e);
                    l && (i.push(c, o),
                    o.appendChild(l.dom),
                    o = l.contentDOM || l.dom)
                }
            }
            o.appendChild(r.serializeNode(t, e))
        }),
        n
    }
    ,
    Ti.prototype.serializeNode = function(t, e) {
        void 0 === e && (e = {});
        var n = Ti.renderSpec(F(e), this.nodes[t.type.name](t))
          , r = n.dom
          , o = n.contentDOM;
        if (o) {
            if (t.isLeaf)
                throw new RangeError("Content hole not allowed in a leaf node spec");
            e.onContent ? e.onContent(t, o, e) : this.serializeFragment(t.content, e, o)
        }
        return r
    }
    ,
    Ti.prototype.serializeNodeAndMarks = function(t, e) {
        var n = this;
        void 0 === e && (e = {});
        for (var r = this.serializeNode(t, e), o = t.marks.length - 1; o >= 0; o--) {
            var i = n.serializeMark(t.marks[o], t.isInline, e);
            i && ((i.contentDOM || i.dom).appendChild(r),
            r = i.dom)
        }
        return r
    }
    ,
    Ti.prototype.serializeMark = function(t, e, n) {
        void 0 === n && (n = {});
        var r = this.marks[t.type.name];
        return r && Ti.renderSpec(F(n), r(t, e))
    }
    ,
    Ti.renderSpec = function(t, e) {
        if ("string" == typeof e)
            return {
                dom: t.createTextNode(e)
            };
        if (null != e.nodeType)
            return {
                dom: e
            };
        var n = t.createElement(e[0])
          , r = null
          , o = e[1]
          , i = 1;
        if (o && "object" == typeof o && null == o.nodeType && !Array.isArray(o)) {
            i = 2;
            for (var s in o)
                null != o[s] && n.setAttribute(s, o[s])
        }
        for (var a = i; a < e.length; a++) {
            var c = e[a];
            if (0 === c) {
                if (a < e.length - 1 || a > i)
                    throw new RangeError("Content hole must be the only child of its parent node");
                return {
                    dom: n,
                    contentDOM: n
                }
            }
            var l = Ti.renderSpec(t, c)
              , p = l.dom
              , u = l.contentDOM;
            if (n.appendChild(p),
            u) {
                if (r)
                    throw new RangeError("Multiple content holes");
                r = u
            }
        }
        return {
            dom: n,
            contentDOM: r
        }
    }
    ,
    Ti.fromSchema = function(t) {
        return t.cached.domSerializer || (t.cached.domSerializer = new Ti(this.nodesFromSchema(t),this.marksFromSchema(t)))
    }
    ,
    Ti.nodesFromSchema = function(t) {
        var e = q(t.nodes);
        return e.text || (e.text = function(t) {
            return t.text
        }
        ),
        e
    }
    ,
    Ti.marksFromSchema = function(t) {
        return q(t.marks)
    }
    ;
    var Di = Object.freeze({
        ContentMatch: li,
        DOMParser: wi,
        DOMSerializer: Ti,
        Fragment: Ko,
        Mark: Go,
        MarkType: gi,
        Node: si,
        NodeRange: ri,
        NodeType: fi,
        ReplaceError: i,
        ResolvedPos: Yo,
        Schema: yi,
        Slice: Qo
    })
      , Ei = 65535
      , Ai = Math.pow(2, 16)
      , Ii = function(t, e, n) {
        void 0 === e && (e = !1),
        void 0 === n && (n = null),
        this.pos = t,
        this.deleted = e,
        this.recover = n
    }
      , Ri = function(t, e) {
        void 0 === e && (e = !1),
        this.ranges = t,
        this.inverted = e
    };
    Ri.prototype.recover = function(t) {
        var e = this
          , n = 0
          , r = j(t);
        if (!this.inverted)
            for (var o = 0; o < r; o++)
                n += e.ranges[3 * o + 2] - e.ranges[3 * o + 1];
        return this.ranges[3 * r] + n + J(t)
    }
    ,
    Ri.prototype.mapResult = function(t, e) {
        return void 0 === e && (e = 1),
        this._map(t, e, !1)
    }
    ,
    Ri.prototype.map = function(t, e) {
        return void 0 === e && (e = 1),
        this._map(t, e, !0)
    }
    ,
    Ri.prototype._map = function(t, e, n) {
        for (var r = this, o = 0, i = this.inverted ? 2 : 1, s = this.inverted ? 1 : 2, a = 0; a < this.ranges.length; a += 3) {
            var c = r.ranges[a] - (r.inverted ? o : 0);
            if (c > t)
                break;
            var l = r.ranges[a + i]
              , p = r.ranges[a + s]
              , u = c + l;
            if (t <= u) {
                var h = c + o + ((l ? t == c ? -1 : t == u ? 1 : e : e) < 0 ? 0 : p);
                if (n)
                    return h;
                var f = L(a / 3, t - c);
                return new Ii(h,e < 0 ? t != c : t != u,f)
            }
            o += p - l
        }
        return n ? t + o : new Ii(t + o)
    }
    ,
    Ri.prototype.touches = function(t, e) {
        for (var n = this, r = 0, o = j(e), i = this.inverted ? 2 : 1, s = this.inverted ? 1 : 2, a = 0; a < this.ranges.length; a += 3) {
            var c = n.ranges[a] - (n.inverted ? r : 0);
            if (c > t)
                break;
            var l = n.ranges[a + i];
            if (t <= c + l && a == 3 * o)
                return !0;
            r += n.ranges[a + s] - l
        }
        return !1
    }
    ,
    Ri.prototype.forEach = function(t) {
        for (var e = this, n = this.inverted ? 2 : 1, r = this.inverted ? 1 : 2, o = 0, i = 0; o < this.ranges.length; o += 3) {
            var s = e.ranges[o]
              , a = s - (e.inverted ? i : 0)
              , c = s + (e.inverted ? 0 : i)
              , l = e.ranges[o + n]
              , p = e.ranges[o + r];
            t(a, a + l, c, c + p),
            i += p - l
        }
    }
    ,
    Ri.prototype.invert = function() {
        return new Ri(this.ranges,!this.inverted)
    }
    ,
    Ri.prototype.toString = function() {
        return (this.inverted ? "-" : "") + JSON.stringify(this.ranges)
    }
    ,
    Ri.offset = function(t) {
        return 0 == t ? Ri.empty : new Ri(t < 0 ? [0, -t, 0] : [0, 0, t])
    }
    ,
    Ri.empty = new Ri([]);
    var zi = function(t, e, n, r) {
        this.maps = t || [],
        this.from = n || 0,
        this.to = null == r ? this.maps.length : r,
        this.mirror = e
    };
    zi.prototype.slice = function(t, e) {
        return void 0 === t && (t = 0),
        void 0 === e && (e = this.maps.length),
        new zi(this.maps,this.mirror,t,e)
    }
    ,
    zi.prototype.copy = function() {
        return new zi(this.maps.slice(),this.mirror && this.mirror.slice(),this.from,this.to)
    }
    ,
    zi.prototype.appendMap = function(t, e) {
        this.to = this.maps.push(t),
        null != e && this.setMirror(this.maps.length - 1, e)
    }
    ,
    zi.prototype.appendMapping = function(t) {
        for (var e = this, n = 0, r = this.maps.length; n < t.maps.length; n++) {
            var o = t.getMirror(n);
            e.appendMap(t.maps[n], null != o && o < n ? r + o : null)
        }
    }
    ,
    zi.prototype.getMirror = function(t) {
        var e = this;
        if (this.mirror)
            for (var n = 0; n < this.mirror.length; n++)
                if (e.mirror[n] == t)
                    return e.mirror[n + (n % 2 ? -1 : 1)]
    }
    ,
    zi.prototype.setMirror = function(t, e) {
        this.mirror || (this.mirror = []),
        this.mirror.push(t, e)
    }
    ,
    zi.prototype.appendMappingInverted = function(t) {
        for (var e = this, n = t.maps.length - 1, r = this.maps.length + t.maps.length; n >= 0; n--) {
            var o = t.getMirror(n);
            e.appendMap(t.maps[n].invert(), null != o && o > n ? r - o - 1 : null)
        }
    }
    ,
    zi.prototype.invert = function() {
        var t = new zi;
        return t.appendMappingInverted(this),
        t
    }
    ,
    zi.prototype.map = function(t, e) {
        var n = this;
        if (void 0 === e && (e = 1),
        this.mirror)
            return this._map(t, e, !0);
        for (var r = this.from; r < this.to; r++)
            t = n.maps[r].map(t, e);
        return t
    }
    ,
    zi.prototype.mapResult = function(t, e) {
        return void 0 === e && (e = 1),
        this._map(t, e, !1)
    }
    ,
    zi.prototype._map = function(t, e, n) {
        for (var r = this, o = !1, i = null, s = this.from; s < this.to; s++) {
            var a = r.maps[s]
              , c = i && i[s];
            if (null != c && a.touches(t, c))
                t = a.recover(c);
            else {
                var l = a.mapResult(t, e);
                if (null != l.recover) {
                    var p = r.getMirror(s);
                    if (null != p && p > s && p < r.to) {
                        if (l.deleted) {
                            s = p,
                            t = r.maps[p].recover(l.recover);
                            continue
                        }
                        (i || (i = Object.create(null)))[p] = l.recover
                    }
                }
                l.deleted && (o = !0),
                t = l.pos
            }
        }
        return n ? t : new Ii(t,o)
    }
    ,
    W.prototype = Object.create(Error.prototype),
    W.prototype.constructor = W,
    W.prototype.name = "TransformError";
    var Pi = function(t) {
        this.doc = t,
        this.steps = [],
        this.docs = [],
        this.mapping = new zi
    }
      , Bi = {
        before: {
            configurable: !0
        },
        docChanged: {
            configurable: !0
        }
    };
    Bi.before.get = function() {
        return this.docs.length ? this.docs[0] : this.doc
    }
    ,
    Pi.prototype.step = function(t) {
        var e = this.maybeStep(t);
        if (e.failed)
            throw new W(e.failed);
        return this
    }
    ,
    Pi.prototype.maybeStep = function(t) {
        var e = t.apply(this.doc);
        return e.failed || this.addStep(t, e.doc),
        e
    }
    ,
    Bi.docChanged.get = function() {
        return this.steps.length > 0
    }
    ,
    Pi.prototype.addStep = function(t, e) {
        this.docs.push(this.doc),
        this.steps.push(t),
        this.mapping.appendMap(t.getMap()),
        this.doc = e
    }
    ,
    Object.defineProperties(Pi.prototype, Bi);
    var Vi = Object.create(null)
      , $i = function() {};
    $i.prototype.apply = function(t) {
        return K()
    }
    ,
    $i.prototype.getMap = function() {
        return Ri.empty
    }
    ,
    $i.prototype.invert = function(t) {
        return K()
    }
    ,
    $i.prototype.map = function(t) {
        return K()
    }
    ,
    $i.prototype.merge = function(t) {
        return null
    }
    ,
    $i.prototype.toJSON = function() {
        return K()
    }
    ,
    $i.fromJSON = function(t, e) {
        if (!e || !e.stepType)
            throw new RangeError("Invalid input for Step.fromJSON");
        var n = Vi[e.stepType];
        if (!n)
            throw new RangeError("No step type " + e.stepType + " defined");
        return n.fromJSON(t, e)
    }
    ,
    $i.jsonID = function(t, e) {
        if (t in Vi)
            throw new RangeError("Duplicate use of step JSON ID " + t);
        return Vi[t] = e,
        e.prototype.jsonID = t,
        e
    }
    ;
    var _i = function(t, e) {
        this.doc = t,
        this.failed = e
    };
    _i.ok = function(t) {
        return new _i(t,null)
    }
    ,
    _i.fail = function(t) {
        return new _i(null,t)
    }
    ,
    _i.fromReplace = function(t, e, n, r) {
        try {
            return _i.ok(t.replace(e, n, r))
        } catch (t) {
            if (t instanceof i)
                return _i.fail(t.message);
            throw t
        }
    }
    ;
    var qi = function(t) {
        function e(e, n, r, o) {
            t.call(this),
            this.from = e,
            this.to = n,
            this.slice = r,
            this.structure = !!o
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.apply = function(t) {
            return this.structure && H(t, this.from, this.to) ? _i.fail("Structure replace would overwrite content") : _i.fromReplace(t, this.from, this.to, this.slice)
        }
        ,
        e.prototype.getMap = function() {
            return new Ri([this.from, this.to - this.from, this.slice.size])
        }
        ,
        e.prototype.invert = function(t) {
            return new e(this.from,this.from + this.slice.size,t.slice(this.from, this.to))
        }
        ,
        e.prototype.map = function(t) {
            var n = t.mapResult(this.from, 1)
              , r = t.mapResult(this.to, -1);
            return n.deleted && r.deleted ? null : new e(n.pos,Math.max(n.pos, r.pos),this.slice)
        }
        ,
        e.prototype.merge = function(t) {
            if (!(t instanceof e) || t.structure != this.structure)
                return null;
            if (this.from + this.slice.size != t.from || this.slice.openEnd || t.slice.openStart) {
                if (t.to != this.from || this.slice.openStart || t.slice.openEnd)
                    return null;
                var n = this.slice.size + t.slice.size == 0 ? Qo.empty : new Qo(t.slice.content.append(this.slice.content),t.slice.openStart,this.slice.openEnd);
                return new e(t.from,this.to,n,this.structure)
            }
            var r = this.slice.size + t.slice.size == 0 ? Qo.empty : new Qo(this.slice.content.append(t.slice.content),this.slice.openStart,t.slice.openEnd);
            return new e(this.from,this.to + (t.to - t.from),r,this.structure)
        }
        ,
        e.prototype.toJSON = function() {
            var t = {
                stepType: "replace",
                from: this.from,
                to: this.to
            };
            return this.slice.size && (t.slice = this.slice.toJSON()),
            this.structure && (t.structure = !0),
            t
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.from || "number" != typeof n.to)
                throw new RangeError("Invalid input for ReplaceStep.fromJSON");
            return new e(n.from,n.to,Qo.fromJSON(t, n.slice),!!n.structure)
        }
        ,
        e
    }($i);
    $i.jsonID("replace", qi);
    var Fi = function(t) {
        function e(e, n, r, o, i, s, a) {
            t.call(this),
            this.from = e,
            this.to = n,
            this.gapFrom = r,
            this.gapTo = o,
            this.slice = i,
            this.insert = s,
            this.structure = !!a
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.apply = function(t) {
            if (this.structure && (H(t, this.from, this.gapFrom) || H(t, this.gapTo, this.to)))
                return _i.fail("Structure gap-replace would overwrite content");
            var e = t.slice(this.gapFrom, this.gapTo);
            if (e.openStart || e.openEnd)
                return _i.fail("Gap is not a flat range");
            var n = this.slice.insertAt(this.insert, e.content);
            return n ? _i.fromReplace(t, this.from, this.to, n) : _i.fail("Content does not fit in gap")
        }
        ,
        e.prototype.getMap = function() {
            return new Ri([this.from, this.gapFrom - this.from, this.insert, this.gapTo, this.to - this.gapTo, this.slice.size - this.insert])
        }
        ,
        e.prototype.invert = function(t) {
            var n = this.gapTo - this.gapFrom;
            return new e(this.from,this.from + this.slice.size + n,this.from + this.insert,this.from + this.insert + n,t.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from),this.gapFrom - this.from,this.structure)
        }
        ,
        e.prototype.map = function(t) {
            var n = t.mapResult(this.from, 1)
              , r = t.mapResult(this.to, -1)
              , o = t.map(this.gapFrom, -1)
              , i = t.map(this.gapTo, 1);
            return n.deleted && r.deleted || o < n.pos || i > r.pos ? null : new e(n.pos,r.pos,o,i,this.slice,this.insert,this.structure)
        }
        ,
        e.prototype.toJSON = function() {
            var t = {
                stepType: "replaceAround",
                from: this.from,
                to: this.to,
                gapFrom: this.gapFrom,
                gapTo: this.gapTo,
                insert: this.insert
            };
            return this.slice.size && (t.slice = this.slice.toJSON()),
            this.structure && (t.structure = !0),
            t
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.from || "number" != typeof n.to || "number" != typeof n.gapFrom || "number" != typeof n.gapTo || "number" != typeof n.insert)
                throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON");
            return new e(n.from,n.to,n.gapFrom,n.gapTo,Qo.fromJSON(t, n.slice),n.insert,!!n.structure)
        }
        ,
        e
    }($i);
    $i.jsonID("replaceAround", Fi),
    Pi.prototype.lift = function(t, e) {
        for (var n = t.$from, r = t.$to, o = t.depth, i = n.before(o + 1), s = r.after(o + 1), a = i, c = s, l = Ko.empty, p = 0, u = o, h = !1; u > e; u--)
            h || n.index(u) > 0 ? (h = !0,
            l = Ko.from(n.node(u).copy(l)),
            p++) : a--;
        for (var f = Ko.empty, d = 0, m = o, v = !1; m > e; m--)
            v || r.after(m + 1) < r.end(m) ? (v = !0,
            f = Ko.from(r.node(m).copy(f)),
            d++) : c++;
        return this.step(new Fi(a,c,i,s,new Qo(l.append(f),p,d),l.size - p,!0))
    }
    ,
    Pi.prototype.wrap = function(t, e) {
        for (var n = Ko.empty, r = e.length - 1; r >= 0; r--)
            n = Ko.from(e[r].type.create(e[r].attrs, n));
        var o = t.start
          , i = t.end;
        return this.step(new Fi(o,i,o,i,new Qo(n,0,0),e.length,!0))
    }
    ,
    Pi.prototype.setBlockType = function(t, e, n, r) {
        var o = this;
        if (void 0 === e && (e = t),
        !n.isTextblock)
            throw new RangeError("Type given to setBlockType should be a textblock");
        var i = this.steps.length;
        return this.doc.nodesBetween(t, e, function(t, e) {
            if (t.isTextblock && !t.hasMarkup(n, r) && tt(o.doc, o.mapping.slice(i).map(e), n)) {
                o.clearIncompatible(o.mapping.slice(i).map(e, 1), n);
                var s = o.mapping.slice(i)
                  , a = s.map(e, 1)
                  , c = s.map(e + t.nodeSize, 1);
                return o.step(new Fi(a,c,a + 1,c - 1,new Qo(Ko.from(n.create(r, null, t.marks)),0,0),1,!0)),
                !1
            }
        }),
        this
    }
    ,
    Pi.prototype.setNodeMarkup = function(t, e, n, r) {
        var o = this.doc.nodeAt(t);
        if (!o)
            throw new RangeError("No node at given position");
        e || (e = o.type);
        var i = e.create(n, null, r || o.marks);
        if (o.isLeaf)
            return this.replaceWith(t, t + o.nodeSize, i);
        if (!e.validContent(o.content))
            throw new RangeError("Invalid content for node type " + e.name);
        return this.step(new Fi(t,t + o.nodeSize,t + 1,t + o.nodeSize - 1,new Qo(Ko.from(i),0,0),1,!0))
    }
    ,
    Pi.prototype.split = function(t, e, n) {
        void 0 === e && (e = 1);
        for (var r = this.doc.resolve(t), o = Ko.empty, i = Ko.empty, s = r.depth, a = r.depth - e, c = e - 1; s > a; s--,
        c--) {
            o = Ko.from(r.node(s).copy(o));
            var l = n && n[c];
            i = Ko.from(l ? l.type.create(l.attrs, i) : r.node(s).copy(i))
        }
        return this.step(new qi(t,t,new Qo(o.append(i),e,e),!0))
    }
    ,
    Pi.prototype.join = function(t, e) {
        void 0 === e && (e = 1);
        var n = new qi(t - e,t + e,Qo.empty,!0);
        return this.step(n)
    }
    ;
    var Li = function(t) {
        function e(e, n, r) {
            t.call(this),
            this.from = e,
            this.to = n,
            this.mark = r
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.apply = function(t) {
            var e = this
              , n = t.slice(this.from, this.to)
              , r = t.resolve(this.from)
              , o = r.node(r.sharedDepth(this.to))
              , i = new Qo(at(n.content, function(t, n) {
                return n.type.allowsMarkType(e.mark.type) ? t.mark(e.mark.addToSet(t.marks)) : t
            }, o),n.openStart,n.openEnd);
            return _i.fromReplace(t, this.from, this.to, i)
        }
        ,
        e.prototype.invert = function() {
            return new ji(this.from,this.to,this.mark)
        }
        ,
        e.prototype.map = function(t) {
            var n = t.mapResult(this.from, 1)
              , r = t.mapResult(this.to, -1);
            return n.deleted && r.deleted || n.pos >= r.pos ? null : new e(n.pos,r.pos,this.mark)
        }
        ,
        e.prototype.merge = function(t) {
            if (t instanceof e && t.mark.eq(this.mark) && this.from <= t.to && this.to >= t.from)
                return new e(Math.min(this.from, t.from),Math.max(this.to, t.to),this.mark)
        }
        ,
        e.prototype.toJSON = function() {
            return {
                stepType: "addMark",
                mark: this.mark.toJSON(),
                from: this.from,
                to: this.to
            }
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.from || "number" != typeof n.to)
                throw new RangeError("Invalid input for AddMarkStep.fromJSON");
            return new e(n.from,n.to,t.markFromJSON(n.mark))
        }
        ,
        e
    }($i);
    $i.jsonID("addMark", Li);
    var ji = function(t) {
        function e(e, n, r) {
            t.call(this),
            this.from = e,
            this.to = n,
            this.mark = r
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.apply = function(t) {
            var e = this
              , n = t.slice(this.from, this.to)
              , r = new Qo(at(n.content, function(t) {
                return t.mark(e.mark.removeFromSet(t.marks))
            }),n.openStart,n.openEnd);
            return _i.fromReplace(t, this.from, this.to, r)
        }
        ,
        e.prototype.invert = function() {
            return new Li(this.from,this.to,this.mark)
        }
        ,
        e.prototype.map = function(t) {
            var n = t.mapResult(this.from, 1)
              , r = t.mapResult(this.to, -1);
            return n.deleted && r.deleted || n.pos >= r.pos ? null : new e(n.pos,r.pos,this.mark)
        }
        ,
        e.prototype.merge = function(t) {
            if (t instanceof e && t.mark.eq(this.mark) && this.from <= t.to && this.to >= t.from)
                return new e(Math.min(this.from, t.from),Math.max(this.to, t.to),this.mark)
        }
        ,
        e.prototype.toJSON = function() {
            return {
                stepType: "removeMark",
                mark: this.mark.toJSON(),
                from: this.from,
                to: this.to
            }
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.from || "number" != typeof n.to)
                throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
            return new e(n.from,n.to,t.markFromJSON(n.mark))
        }
        ,
        e
    }($i);
    $i.jsonID("removeMark", ji),
    Pi.prototype.addMark = function(t, e, n) {
        var r = this
          , o = []
          , i = []
          , s = null
          , a = null;
        return this.doc.nodesBetween(t, e, function(r, c, l) {
            if (r.isInline) {
                var p = r.marks;
                if (!n.isInSet(p) && l.type.allowsMarkType(n.type)) {
                    for (var u = Math.max(c, t), h = Math.min(c + r.nodeSize, e), f = n.addToSet(p), d = 0; d < p.length; d++)
                        p[d].isInSet(f) || (s && s.to == u && s.mark.eq(p[d]) ? s.to = h : o.push(s = new ji(u,h,p[d])));
                    a && a.to == u ? a.to = h : i.push(a = new Li(u,h,n))
                }
            }
        }),
        o.forEach(function(t) {
            return r.step(t)
        }),
        i.forEach(function(t) {
            return r.step(t)
        }),
        this
    }
    ,
    Pi.prototype.removeMark = function(t, e, n) {
        var r = this;
        void 0 === n && (n = null);
        var o = []
          , i = 0;
        return this.doc.nodesBetween(t, e, function(r, s) {
            if (r.isInline) {
                i++;
                var a = null;
                if (n instanceof gi) {
                    var c = n.isInSet(r.marks);
                    c && (a = [c])
                } else
                    n ? n.isInSet(r.marks) && (a = [n]) : a = r.marks;
                if (a && a.length)
                    for (var l = Math.min(s + r.nodeSize, e), p = 0; p < a.length; p++) {
                        for (var u = a[p], h = void 0, f = 0; f < o.length; f++) {
                            var d = o[f];
                            d.step == i - 1 && u.eq(o[f].style) && (h = d)
                        }
                        h ? (h.to = l,
                        h.step = i) : o.push({
                            style: u,
                            from: Math.max(s, t),
                            to: l,
                            step: i
                        })
                    }
            }
        }),
        o.forEach(function(t) {
            return r.step(new ji(t.from,t.to,t.style))
        }),
        this
    }
    ,
    Pi.prototype.clearIncompatible = function(t, e, n) {
        var r = this;
        void 0 === n && (n = e.contentMatch);
        for (var o = this.doc.nodeAt(t), i = [], s = t + 1, a = 0; a < o.childCount; a++) {
            var c = o.child(a)
              , l = s + c.nodeSize
              , p = n.matchType(c.type, c.attrs);
            if (p) {
                n = p;
                for (var u = 0; u < c.marks.length; u++)
                    e.allowsMarkType(c.marks[u].type) || r.step(new ji(s,l,c.marks[u]))
            } else
                i.push(new qi(s,l,Qo.empty));
            s = l
        }
        if (!n.validEnd) {
            var h = n.fillBefore(Ko.empty, !0);
            this.replace(s, s, new Qo(h,0,0))
        }
        for (var f = i.length - 1; f >= 0; f--)
            r.step(i[f]);
        return this
    }
    ,
    Pi.prototype.replace = function(t, e, n) {
        void 0 === e && (e = t),
        void 0 === n && (n = Qo.empty);
        var r = ct(this.doc, t, e, n);
        return r && this.step(r),
        this
    }
    ,
    Pi.prototype.replaceWith = function(t, e, n) {
        return this.replace(t, e, new Qo(Ko.from(n),0,0))
    }
    ,
    Pi.prototype.delete = function(t, e) {
        return this.replace(t, e, Qo.empty)
    }
    ,
    Pi.prototype.insert = function(t, e) {
        return this.replaceWith(t, t, e)
    }
    ;
    var Ji = function(t) {
        var e = this;
        this.open = [];
        for (var n = 0; n <= t.depth; n++) {
            var r = t.node(n)
              , o = r.contentMatchAt(t.indexAfter(n));
            e.open.push({
                parent: r,
                match: o,
                content: Ko.empty,
                wrapper: !1,
                openEnd: 0,
                depth: n
            })
        }
        this.placed = []
    };
    Ji.prototype.placeSlice = function(t, e, n, r, o) {
        if (e > 0) {
            var i = t.firstChild
              , s = this.placeSlice(i.content, Math.max(0, e - 1), n && 1 == t.childCount ? n - 1 : 0, r, i);
            s.content != i.content && (s.content.size ? (t = t.replaceChild(0, i.copy(s.content)),
            e = s.openStart + 1) : (1 == t.childCount && (n = 0),
            t = t.cutByIndex(1),
            e = 0))
        }
        var a = this.placeContent(t, e, n, r, o);
        if (r > 2 && a.size && 0 == e) {
            var c = a.content.firstChild
              , l = 1 == a.content.childCount;
            this.placeContent(c.content, 0, n && l ? n - 1 : 0, r, c),
            a = l ? Ko.empty : new Qo(a.content.cutByIndex(1),0,n)
        }
        return a
    }
    ,
    Ji.prototype.placeContent = function(t, e, n, r, o) {
        for (var i = this, s = 0; s < t.childCount; s++) {
            for (var a = t.child(s), c = !1, l = s == t.childCount - 1, p = this.open.length - 1; p >= 0; p--) {
                var u = i.open[p]
                  , h = void 0;
                if (r > 1 && (h = u.match.findWrapping(a.type)) && (!o || !h.length || h[h.length - 1] != o.type)) {
                    for (; this.open.length - 1 > p; )
                        i.closeNode();
                    for (var f = 0; f < h.length; f++)
                        u.match = u.match.matchType(h[f]),
                        p++,
                        u = {
                            parent: h[f].create(),
                            match: h[f].contentMatch,
                            content: Ko.empty,
                            wrapper: !0,
                            openEnd: 0,
                            depth: p + f
                        },
                        i.open.push(u)
                }
                var d = u.match.matchType(a.type);
                if (!d) {
                    var m = u.match.fillBefore(Ko.from(a));
                    if (!m) {
                        if (o && u.match.matchType(o.type))
                            break;
                        continue
                    }
                    for (var v = 0; v < m.childCount; v++) {
                        var g = m.child(v);
                        i.addNode(u, g, 0),
                        d = u.match.matchFragment(g)
                    }
                }
                for (; this.open.length - 1 > p; )
                    i.closeNode();
                a = a.mark(u.parent.type.allowedMarks(a.marks)),
                e && (a = bt(a, e, l ? n : 0),
                e = 0),
                i.addNode(u, a, l ? n : 0),
                u.match = d,
                l && (n = 0),
                c = !0;
                break
            }
            if (!c)
                break
        }
        return this.open.length > 1 && (s > 0 && s == t.childCount || o && this.open[this.open.length - 1].parent.type == o.type) && this.closeNode(),
        new Qo(t.cutByIndex(s),e,n)
    }
    ,
    Ji.prototype.addNode = function(t, e, n) {
        t.content = xt(t.content, t.openEnd).addToEnd(e),
        t.openEnd = n
    }
    ,
    Ji.prototype.closeNode = function() {
        var t = this.open.pop();
        0 == t.content.size || (t.wrapper ? this.addNode(this.open[this.open.length - 1], t.parent.copy(t.content), t.openEnd + 1) : this.placed[t.depth] = {
            depth: t.depth,
            content: t.content,
            openEnd: t.openEnd
        })
    }
    ,
    Pi.prototype.replaceRange = function(t, e, n) {
        var r = this;
        if (!n.size)
            return this.deleteRange(t, e);
        var o = this.doc.resolve(t)
          , i = this.doc.resolve(e);
        if (vt(o, i, n))
            return this.step(new qi(t,e,n));
        var s = Mt(o, this.doc.resolve(e));
        0 == s[s.length - 1] && s.pop();
        var a = -(o.depth + 1);
        s.unshift(a);
        for (var c = o.depth, l = o.pos - 1; c > 0; c--,
        l--) {
            var p = o.node(c).type.spec;
            if (p.defining || p.isolating)
                break;
            s.indexOf(c) > -1 ? a = c : o.before(c) == l && s.splice(1, 0, -c)
        }
        for (var u = s.indexOf(a), h = [], f = n.openStart, d = n.content, m = 0; ; m++) {
            var v = d.firstChild;
            if (h.push(v),
            m == n.openStart)
                break;
            d = v.content
        }
        f > 0 && h[f - 1].type.spec.defining && o.node(u).type != h[f - 1].type ? f -= 1 : f >= 2 && h[f - 1].isTextblock && h[f - 2].type.spec.defining && o.node(u).type != h[f - 2].type && (f -= 2);
        for (var g = n.openStart; g >= 0; g--) {
            var y = (g + f + 1) % (n.openStart + 1)
              , w = h[y];
            if (w)
                for (var b = 0; b < s.length; b++) {
                    var k = s[(b + u) % s.length]
                      , x = !0;
                    k < 0 && (x = !1,
                    k = -k);
                    var S = o.node(k - 1)
                      , M = o.index(k - 1);
                    if (S.canReplaceWith(M, M, w.type, w.marks))
                        return r.replace(o.before(k), x ? i.after(k) : e, new Qo(St(n.content, 0, n.openStart, y),y,n.openEnd))
                }
        }
        for (var C = this.steps.length, O = s.length - 1; O >= 0 && (r.replace(t, e, n),
        !(r.steps.length > C)); O--) {
            var N = s[O];
            O < 0 || (t = o.before(N),
            e = i.after(N))
        }
        return this
    }
    ,
    Pi.prototype.replaceRangeWith = function(t, e, n) {
        if (!n.isInline && t == e && this.doc.resolve(t).parent.content.size) {
            var r = it(this.doc, t, n.type);
            null != r && (t = e = r)
        }
        return this.replaceRange(t, e, new Qo(Ko.from(n),0,0))
    }
    ,
    Pi.prototype.deleteRange = function(t, e) {
        for (var n = this, r = this.doc.resolve(t), o = this.doc.resolve(e), i = Mt(r, o), s = 0; s < i.length; s++) {
            var a = i[s]
              , c = s == i.length - 1;
            if (c && 0 == a || r.node(a).type.contentMatch.validEnd)
                return n.delete(r.start(a), o.end(a));
            if (a > 0 && (c || r.node(a - 1).canReplace(r.index(a - 1), o.indexAfter(a - 1))))
                return n.delete(r.before(a), o.after(a))
        }
        for (var l = 1; l <= r.depth && l <= o.depth; l++)
            if (t - r.start(l) == r.depth - l && e > r.end(l) && o.end(l) - e != o.depth - l)
                return n.delete(r.before(l), e);
        return this.delete(t, e)
    }
    ;
    var Wi = Object.freeze({
        AddMarkStep: Li,
        MapResult: Ii,
        Mapping: zi,
        RemoveMarkStep: ji,
        ReplaceAroundStep: Fi,
        ReplaceStep: qi,
        Step: $i,
        StepMap: Ri,
        StepResult: _i,
        Transform: Pi,
        TransformError: W,
        canJoin: nt,
        canSplit: et,
        dropPoint: st,
        findWrapping: Q,
        insertPoint: it,
        joinPoint: ot,
        liftTarget: G,
        replaceStep: ct
    })
      , Ki = Object.create(null)
      , Hi = function(t, e, n) {
        this.ranges = n || [new Gi(t.min(e),t.max(e))],
        this.$anchor = t,
        this.$head = e
    }
      , Ui = {
        anchor: {
            configurable: !0
        },
        head: {
            configurable: !0
        },
        from: {
            configurable: !0
        },
        to: {
            configurable: !0
        },
        $from: {
            configurable: !0
        },
        $to: {
            configurable: !0
        },
        empty: {
            configurable: !0
        }
    };
    Ui.anchor.get = function() {
        return this.$anchor.pos
    }
    ,
    Ui.head.get = function() {
        return this.$head.pos
    }
    ,
    Ui.from.get = function() {
        return this.$from.pos
    }
    ,
    Ui.to.get = function() {
        return this.$to.pos
    }
    ,
    Ui.$from.get = function() {
        return this.ranges[0].$from
    }
    ,
    Ui.$to.get = function() {
        return this.ranges[0].$to
    }
    ,
    Ui.empty.get = function() {
        for (var t = this.ranges, e = 0; e < t.length; e++)
            if (t[e].$from.pos != t[e].$to.pos)
                return !1;
        return !0
    }
    ,
    Hi.prototype.content = function() {
        return this.$from.node(0).slice(this.from, this.to, !0)
    }
    ,
    Hi.prototype.replace = function(t, e) {
        void 0 === e && (e = Qo.empty);
        for (var n = e.content.lastChild, r = null, o = 0; o < e.openEnd; o++)
            r = n,
            n = n.lastChild;
        for (var i = t.steps.length, s = this.ranges, a = 0; a < s.length; a++) {
            var c = s[a]
              , l = c.$from
              , p = c.$to
              , u = t.mapping.slice(i);
            t.replaceRange(u.map(l.pos), u.map(p.pos), a ? Qo.empty : e),
            0 == a && Ot(t, i, (n ? n.isInline : r && r.isTextblock) ? -1 : 1)
        }
    }
    ,
    Hi.prototype.replaceWith = function(t, e) {
        for (var n = t.steps.length, r = this.ranges, o = 0; o < r.length; o++) {
            var i = r[o]
              , s = i.$from
              , a = i.$to
              , c = t.mapping.slice(n)
              , l = c.map(s.pos)
              , p = c.map(a.pos);
            o ? t.deleteRange(l, p) : (t.replaceRangeWith(l, p, e),
            Ot(t, n, e.isInline ? -1 : 1))
        }
    }
    ,
    Hi.findFrom = function(t, e, n) {
        var r = t.parent.inlineContent ? new Qi(t) : Ct(t.node(0), t.parent, t.pos, t.index(), e, n);
        if (r)
            return r;
        for (var o = t.depth - 1; o >= 0; o--) {
            var i = e < 0 ? Ct(t.node(0), t.node(o), t.before(o + 1), t.index(o), e, n) : Ct(t.node(0), t.node(o), t.after(o + 1), t.index(o) + 1, e, n);
            if (i)
                return i
        }
    }
    ,
    Hi.near = function(t, e) {
        return void 0 === e && (e = 1),
        this.findFrom(t, e) || this.findFrom(t, -e) || new ts(t.node(0))
    }
    ,
    Hi.atStart = function(t) {
        return Ct(t, t, 0, 0, 1) || new ts(t)
    }
    ,
    Hi.atEnd = function(t) {
        return Ct(t, t, t.content.size, t.childCount, -1) || new ts(t)
    }
    ,
    Hi.fromJSON = function(t, e) {
        if (!e || !e.type)
            throw new RangeError("Invalid input for Selection.fromJSON");
        var n = Ki[e.type];
        if (!n)
            throw new RangeError("No selection type " + e.type + " defined");
        return n.fromJSON(t, e)
    }
    ,
    Hi.jsonID = function(t, e) {
        if (t in Ki)
            throw new RangeError("Duplicate use of selection JSON ID " + t);
        return Ki[t] = e,
        e.prototype.jsonID = t,
        e
    }
    ,
    Hi.prototype.getBookmark = function() {
        return Qi.between(this.$anchor, this.$head).getBookmark()
    }
    ,
    Object.defineProperties(Hi.prototype, Ui),
    Hi.prototype.visible = !0;
    var Gi = function(t, e) {
        this.$from = t,
        this.$to = e
    }
      , Qi = function(t) {
        function e(e, n) {
            void 0 === n && (n = e),
            t.call(this, e, n)
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            $cursor: {
                configurable: !0
            }
        };
        return n.$cursor.get = function() {
            return this.$anchor.pos == this.$head.pos ? this.$head : null
        }
        ,
        e.prototype.map = function(n, r) {
            var o = n.resolve(r.map(this.head));
            if (!o.parent.inlineContent)
                return t.near(o);
            var i = n.resolve(r.map(this.anchor));
            return new e(i.parent.inlineContent ? i : o,o)
        }
        ,
        e.prototype.replace = function(e, n) {
            if (void 0 === n && (n = Qo.empty),
            t.prototype.replace.call(this, e, n),
            n == Qo.empty) {
                var r = this.$from.marksAcross(this.$to);
                r && e.ensureMarks(r)
            }
        }
        ,
        e.prototype.eq = function(t) {
            return t instanceof e && t.anchor == this.anchor && t.head == this.head
        }
        ,
        e.prototype.getBookmark = function() {
            return new Xi(this.anchor,this.head)
        }
        ,
        e.prototype.toJSON = function() {
            return {
                type: "text",
                anchor: this.anchor,
                head: this.head
            }
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.anchor || "number" != typeof n.head)
                throw new RangeError("Invalid input for TextSelection.fromJSON");
            return new e(t.resolve(n.anchor),t.resolve(n.head))
        }
        ,
        e.create = function(t, e, n) {
            void 0 === n && (n = e);
            var r = t.resolve(e);
            return new this(r,n == e ? r : t.resolve(n))
        }
        ,
        e.between = function(n, r, o) {
            var i = n.pos - r.pos;
            if (o && !i || (o = i >= 0 ? 1 : -1),
            !r.parent.inlineContent) {
                var s = t.findFrom(r, o, !0) || t.findFrom(r, -o, !0);
                if (!s)
                    return t.near(r, o);
                r = s.$head
            }
            return n.parent.inlineContent || (0 == i ? n = r : (n = (t.findFrom(n, -o, !0) || t.findFrom(n, o, !0)).$anchor).pos < r.pos != i < 0 && (n = r)),
            new e(n,r)
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(Hi);
    Hi.jsonID("text", Qi);
    var Xi = function(t, e) {
        this.anchor = t,
        this.head = e
    };
    Xi.prototype.map = function(t) {
        return new Xi(t.map(this.anchor),t.map(this.head))
    }
    ,
    Xi.prototype.resolve = function(t) {
        return Qi.between(t.resolve(this.anchor), t.resolve(this.head))
    }
    ;
    var Yi = function(t) {
        function e(e) {
            var n = e.nodeAfter
              , r = e.node(0).resolve(e.pos + n.nodeSize);
            t.call(this, e, r),
            this.node = n
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.map = function(n, r) {
            var o = r.mapResult(this.anchor)
              , i = o.deleted
              , s = o.pos
              , a = n.resolve(s);
            return i ? t.near(a) : new e(a)
        }
        ,
        e.prototype.content = function() {
            return new Qo(Ko.from(this.node),0,0)
        }
        ,
        e.prototype.eq = function(t) {
            return t instanceof e && t.anchor == this.anchor
        }
        ,
        e.prototype.toJSON = function() {
            return {
                type: "node",
                anchor: this.anchor
            }
        }
        ,
        e.prototype.getBookmark = function() {
            return new Zi(this.anchor)
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.anchor)
                throw new RangeError("Invalid input for NodeSelection.fromJSON");
            return new e(t.resolve(n.anchor))
        }
        ,
        e.create = function(t, e) {
            return new this(t.resolve(e))
        }
        ,
        e.isSelectable = function(t) {
            return !t.isText && !1 !== t.type.spec.selectable
        }
        ,
        e
    }(Hi);
    Yi.prototype.visible = !1,
    Hi.jsonID("node", Yi);
    var Zi = function(t) {
        this.anchor = t
    };
    Zi.prototype.map = function(t) {
        var e = t.mapResult(this.anchor)
          , n = e.deleted
          , r = e.pos;
        return n ? new Xi(r,r) : new Zi(r)
    }
    ,
    Zi.prototype.resolve = function(t) {
        var e = t.resolve(this.anchor)
          , n = e.nodeAfter;
        return n && Yi.isSelectable(n) ? new Yi(e) : Hi.near(e)
    }
    ;
    var ts = function(t) {
        function e(e) {
            t.call(this, e.resolve(0), e.resolve(e.content.size))
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.toJSON = function() {
            return {
                type: "all"
            }
        }
        ,
        e.fromJSON = function(t) {
            return new e(t)
        }
        ,
        e.prototype.map = function(t) {
            return new e(t)
        }
        ,
        e.prototype.eq = function(t) {
            return t instanceof e
        }
        ,
        e.prototype.getBookmark = function() {
            return es
        }
        ,
        e
    }(Hi);
    Hi.jsonID("all", ts);
    var es = {
        map: function() {
            return this
        },
        resolve: function(t) {
            return new ts(t)
        }
    }
      , ns = function(t) {
        function e(e) {
            t.call(this, e.doc),
            this.time = Date.now(),
            this.curSelection = e.selection,
            this.curSelectionFor = 0,
            this.storedMarks = e.storedMarks,
            this.updated = 0,
            this.meta = Object.create(null)
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            selection: {
                configurable: !0
            },
            selectionSet: {
                configurable: !0
            },
            storedMarksSet: {
                configurable: !0
            },
            isGeneric: {
                configurable: !0
            },
            scrolledIntoView: {
                configurable: !0
            }
        };
        return n.selection.get = function() {
            return this.curSelectionFor < this.steps.length && (this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor)),
            this.curSelectionFor = this.steps.length),
            this.curSelection
        }
        ,
        e.prototype.setSelection = function(t) {
            if (t.$from.doc != this.doc)
                throw new RangeError("Selection passed to setSelection must point at the current document");
            return this.curSelection = t,
            this.curSelectionFor = this.steps.length,
            this.updated = -3 & (1 | this.updated),
            this.storedMarks = null,
            this
        }
        ,
        n.selectionSet.get = function() {
            return (1 & this.updated) > 0
        }
        ,
        e.prototype.setStoredMarks = function(t) {
            return this.storedMarks = t,
            this.updated |= 2,
            this
        }
        ,
        e.prototype.ensureMarks = function(t) {
            return Go.sameSet(this.storedMarks || this.selection.$from.marks(), t) || this.setStoredMarks(t),
            this
        }
        ,
        e.prototype.addStoredMark = function(t) {
            return this.ensureMarks(t.addToSet(this.storedMarks || this.selection.$head.marks()))
        }
        ,
        e.prototype.removeStoredMark = function(t) {
            return this.ensureMarks(t.removeFromSet(this.storedMarks || this.selection.$head.marks()))
        }
        ,
        n.storedMarksSet.get = function() {
            return (2 & this.updated) > 0
        }
        ,
        e.prototype.addStep = function(e, n) {
            t.prototype.addStep.call(this, e, n),
            this.updated = -3 & this.updated,
            this.storedMarks = null
        }
        ,
        e.prototype.setTime = function(t) {
            return this.time = t,
            this
        }
        ,
        e.prototype.replaceSelection = function(t) {
            return this.selection.replace(this, t),
            this
        }
        ,
        e.prototype.replaceSelectionWith = function(t, e) {
            var n = this.selection;
            return !1 !== e && (t = t.mark(this.storedMarks || (n.empty ? n.$from.marks() : n.$from.marksAcross(n.$to) || Go.none))),
            n.replaceWith(this, t),
            this
        }
        ,
        e.prototype.deleteSelection = function() {
            return this.selection.replace(this),
            this
        }
        ,
        e.prototype.insertText = function(t, e, n) {
            void 0 === n && (n = e);
            var r = this.doc.type.schema;
            if (null == e)
                return t ? this.replaceSelectionWith(r.text(t), !0) : this.deleteSelection();
            if (!t)
                return this.deleteRange(e, n);
            var o = this.storedMarks;
            if (!o) {
                var i = this.doc.resolve(e);
                o = n == e ? i.marks() : i.marksAcross(this.doc.resolve(n))
            }
            return this.replaceRangeWith(e, n, r.text(t, o)),
            this.selection.empty || this.setSelection(Hi.near(this.selection.$to)),
            this
        }
        ,
        e.prototype.setMeta = function(t, e) {
            return this.meta["string" == typeof t ? t : t.key] = e,
            this
        }
        ,
        e.prototype.getMeta = function(t) {
            return this.meta["string" == typeof t ? t : t.key]
        }
        ,
        n.isGeneric.get = function() {
            var t = this;
            for (var e in t.meta)
                return !1;
            return !0
        }
        ,
        e.prototype.scrollIntoView = function() {
            return this.updated |= 4,
            this
        }
        ,
        n.scrolledIntoView.get = function() {
            return (4 & this.updated) > 0
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(Pi)
      , rs = function(t, e, n) {
        this.name = t,
        this.init = Nt(e.init, n),
        this.apply = Nt(e.apply, n)
    }
      , is = [new rs("doc",{
        init: function(t) {
            return t.doc || t.schema.topNodeType.createAndFill()
        },
        apply: function(t) {
            return t.doc
        }
    }), new rs("selection",{
        init: function(t, e) {
            return t.selection || Hi.atStart(e.doc)
        },
        apply: function(t) {
            return t.selection
        }
    }), new rs("storedMarks",{
        init: function(t) {
            return t.storedMarks || null
        },
        apply: function(t, e, n, r) {
            return r.selection.$cursor ? t.storedMarks : null
        }
    }), new rs("scrollToSelection",{
        init: function() {
            return 0
        },
        apply: function(t, e) {
            return t.scrolledIntoView ? e + 1 : e
        }
    })]
      , ss = function(t, e) {
        var n = this;
        this.schema = t,
        this.fields = is.concat(),
        this.plugins = [],
        this.pluginsByKey = Object.create(null),
        e && e.forEach(function(t) {
            if (n.pluginsByKey[t.key])
                throw new RangeError("Adding different instances of a keyed plugin (" + t.key + ")");
            n.plugins.push(t),
            n.pluginsByKey[t.key] = t,
            t.spec.state && n.fields.push(new rs(t.key,t.spec.state,t))
        })
    }
      , as = function(t) {
        this.config = t
    }
      , cs = {
        schema: {
            configurable: !0
        },
        plugins: {
            configurable: !0
        },
        tr: {
            configurable: !0
        }
    };
    cs.schema.get = function() {
        return this.config.schema
    }
    ,
    cs.plugins.get = function() {
        return this.config.plugins
    }
    ,
    as.prototype.apply = function(t) {
        return this.applyTransaction(t).state
    }
    ,
    as.prototype.filterTransaction = function(t, e) {
        var n = this;
        void 0 === e && (e = -1);
        for (var r = 0; r < this.config.plugins.length; r++)
            if (r != e) {
                var o = n.config.plugins[r];
                if (o.spec.filterTransaction && !o.spec.filterTransaction.call(o, t, n))
                    return !1
            }
        return !0
    }
    ,
    as.prototype.applyTransaction = function(t) {
        var e = this;
        if (!this.filterTransaction(t))
            return {
                state: this,
                transactions: []
            };
        for (var n = [t], r = this.applyInner(t), o = null; ; ) {
            for (var i = !1, s = 0; s < this.config.plugins.length; s++) {
                var a = e.config.plugins[s];
                if (a.spec.appendTransaction) {
                    var c = o ? o[s].n : 0
                      , l = o ? o[s].state : e
                      , p = c < n.length && a.spec.appendTransaction.call(a, c ? n.slice(c) : n, l, r);
                    if (p && r.filterTransaction(p, s)) {
                        if (p.setMeta("appendedTransaction", t),
                        !o) {
                            o = [];
                            for (var u = 0; u < this.config.plugins.length; u++)
                                o.push(u < s ? {
                                    state: r,
                                    n: n.length
                                } : {
                                    state: e,
                                    n: 0
                                })
                        }
                        n.push(p),
                        r = r.applyInner(p),
                        i = !0
                    }
                    o && (o[s] = {
                        state: r,
                        n: n.length
                    })
                }
            }
            if (!i)
                return {
                    state: r,
                    transactions: n
                }
        }
    }
    ,
    as.prototype.applyInner = function(t) {
        var e = this;
        if (!t.before.eq(this.doc))
            throw new RangeError("Applying a mismatched transaction");
        for (var n = new as(this.config), r = this.config.fields, o = 0; o < r.length; o++) {
            var i = r[o];
            n[i.name] = i.apply(t, e[i.name], e, n)
        }
        for (var s = 0; s < ls.length; s++)
            ls[s](e, t, n);
        return n
    }
    ,
    cs.tr.get = function() {
        return new ns(this)
    }
    ,
    as.create = function(t) {
        for (var e = new ss(t.schema || t.doc.type.schema,t.plugins), n = new as(e), r = 0; r < e.fields.length; r++)
            n[e.fields[r].name] = e.fields[r].init(t, n);
        return n
    }
    ,
    as.prototype.reconfigure = function(t) {
        for (var e = this, n = new ss(t.schema || this.schema,t.plugins), r = n.fields, o = new as(n), i = 0; i < r.length; i++) {
            var s = r[i].name;
            o[s] = e.hasOwnProperty(s) ? e[s] : r[i].init(t, o)
        }
        return o
    }
    ,
    as.prototype.toJSON = function(t) {
        var e = this
          , n = {
            doc: this.doc.toJSON(),
            selection: this.selection.toJSON()
        };
        if (this.storedMarks && (n.storedMarks = this.storedMarks.map(function(t) {
            return t.toJSON()
        })),
        t && "object" == typeof t)
            for (var r in t) {
                if ("doc" == r || "selection" == r)
                    throw new RangeError("The JSON fields `doc` and `selection` are reserved");
                var o = t[r]
                  , i = o.spec.state;
                i && i.toJSON && (n[r] = i.toJSON.call(o, e[o.key]))
            }
        return n
    }
    ,
    as.fromJSON = function(t, e, n) {
        if (!e)
            throw new RangeError("Invalid input for EditorState.fromJSON");
        if (!t.schema)
            throw new RangeError("Required config field 'schema' missing");
        var r = new ss(t.schema,t.plugins)
          , o = new as(r);
        return r.fields.forEach(function(r) {
            if ("doc" == r.name)
                o.doc = si.fromJSON(t.schema, e.doc);
            else if ("selection" == r.name)
                o.selection = Hi.fromJSON(o.doc, e.selection);
            else if ("storedMarks" == r.name)
                e.storedMarks && (o.storedMarks = e.storedMarks.map(t.schema.markFromJSON));
            else {
                if (n)
                    for (var i in n) {
                        var s = n[i]
                          , a = s.spec.state;
                        if (s.key == r.name && a && a.fromJSON && Object.prototype.hasOwnProperty.call(e, i))
                            return void (o[r.name] = a.fromJSON.call(s, t, e[i], o))
                    }
                o[r.name] = r.init(t, o)
            }
        }),
        o
    }
    ,
    as.addApplyListener = function(t) {
        ls.push(t)
    }
    ,
    as.removeApplyListener = function(t) {
        var e = ls.indexOf(t);
        e > -1 && ls.splice(e, 1)
    }
    ,
    Object.defineProperties(as.prototype, cs);
    var ls = []
      , ps = function(t) {
        this.props = {},
        t.props && Tt(t.props, this, this.props),
        this.spec = t,
        this.key = t.key ? t.key.key : Dt("plugin")
    };
    ps.prototype.getState = function(t) {
        return t[this.key]
    }
    ;
    var us = Object.create(null)
      , hs = function(t) {
        void 0 === t && (t = "key"),
        this.key = Dt(t)
    };
    hs.prototype.get = function(t) {
        return t.config.pluginsByKey[this.key]
    }
    ,
    hs.prototype.getState = function(t) {
        return t[this.key]
    }
    ;
    var fs = Object.freeze({
        AllSelection: ts,
        EditorState: as,
        NodeSelection: Yi,
        Plugin: ps,
        PluginKey: hs,
        Selection: Hi,
        SelectionRange: Gi,
        TextSelection: Qi,
        Transaction: ns
    })
      , ds = {};
    if ("undefined" != typeof navigator && "undefined" != typeof document) {
        var ms = /Edge\/(\d+)/.exec(navigator.userAgent)
          , vs = /MSIE \d/.test(navigator.userAgent)
          , gs = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
        ds.mac = /Mac/.test(navigator.platform);
        var ys = ds.ie = !!(vs || gs || ms);
        ds.ie_version = vs ? document.documentMode || 6 : gs ? +gs[1] : ms ? +ms[1] : null,
        ds.gecko = !ys && /gecko\/(\d+)/i.test(navigator.userAgent),
        ds.gecko_version = ds.gecko && +(/Firefox\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1];
        var ws = !ys && /Chrome\/(\d+)/.exec(navigator.userAgent);
        ds.chrome = !!ws,
        ds.chrome_version = ws && +ws[1],
        ds.ios = !ys && /AppleWebKit/.test(navigator.userAgent) && /Mobile\/\w+/.test(navigator.userAgent),
        ds.android = /Android \d/.test(navigator.userAgent),
        ds.webkit = !ys && "WebkitAppearance"in document.documentElement.style,
        ds.safari = /Apple Computer/.test(navigator.vendor),
        ds.webkit_version = ds.webkit && +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1]
    }
    var bs = function(t) {
        for (var e = 0; ; e++)
            if (!(t = t.previousSibling))
                return e
    }
      , ks = function(t) {
        var e = t.parentNode;
        return e && 11 == e.nodeType ? e.host : e
    }
      , xs = function(t, e, n) {
        var r = document.createRange();
        return r.setEnd(t, null == n ? t.nodeValue.length : n),
        r.setStart(t, e || 0),
        r
    }
      , Ss = function(t, e, n, r) {
        return n && (Et(t, e, n, r, -1) || Et(t, e, n, r, 1))
    }
      , Ms = /^(img|br|input|textarea|hr)$/i
      , Cs = function(t) {
        var e = t.isCollapsed;
        return e && ds.chrome && t.rangeCount && !t.getRangeAt(0).collapsed && (e = !1),
        e
    }
      , Os = null
      , Ns = /[\u0590-\u08ac]/
      , Ts = null
      , Ds = null
      , Es = !1
      , As = function(t, e, n, r) {
        this.parent = t,
        this.children = e,
        this.dom = n,
        n.pmViewDesc = this,
        this.contentDOM = r,
        this.dirty = 0
    }
      , Is = {
        beforePosition: {
            configurable: !0
        },
        size: {
            configurable: !0
        },
        border: {
            configurable: !0
        },
        posBefore: {
            configurable: !0
        },
        posAtStart: {
            configurable: !0
        },
        posAfter: {
            configurable: !0
        },
        posAtEnd: {
            configurable: !0
        },
        contentLost: {
            configurable: !0
        }
    };
    As.prototype.matchesWidget = function() {
        return !1
    }
    ,
    As.prototype.matchesMark = function() {
        return !1
    }
    ,
    As.prototype.matchesNode = function() {
        return !1
    }
    ,
    As.prototype.matchesHack = function() {
        return !1
    }
    ,
    Is.beforePosition.get = function() {
        return !1
    }
    ,
    As.prototype.parseRule = function() {
        return null
    }
    ,
    As.prototype.stopEvent = function() {
        return !1
    }
    ,
    Is.size.get = function() {
        for (var t = this, e = 0, n = 0; n < this.children.length; n++)
            e += t.children[n].size;
        return e
    }
    ,
    Is.border.get = function() {
        return 0
    }
    ,
    As.prototype.destroy = function() {
        var t = this;
        this.parent = null,
        this.dom.pmViewDesc == this && (this.dom.pmViewDesc = null);
        for (var e = 0; e < this.children.length; e++)
            t.children[e].destroy()
    }
    ,
    As.prototype.posBeforeChild = function(t) {
        for (var e = this, n = 0, r = this.posAtStart; n < this.children.length; n++) {
            var o = e.children[n];
            if (o == t)
                return r;
            r += o.size
        }
    }
    ,
    Is.posBefore.get = function() {
        return this.parent.posBeforeChild(this)
    }
    ,
    Is.posAtStart.get = function() {
        return this.parent ? this.parent.posBeforeChild(this) + this.border : 0
    }
    ,
    Is.posAfter.get = function() {
        return this.posBefore + this.size
    }
    ,
    Is.posAtEnd.get = function() {
        return this.posAtStart + this.size - 2 * this.border
    }
    ,
    As.prototype.localPosFromDOM = function(t, e, n) {
        var r = this;
        if (this.contentDOM && this.contentDOM.contains(1 == t.nodeType ? t : t.parentNode)) {
            if (n < 0) {
                var o, i;
                if (t == this.contentDOM)
                    o = t.childNodes[e - 1];
                else {
                    for (; t.parentNode != this.contentDOM; )
                        t = t.parentNode;
                    o = t.previousSibling
                }
                for (; o && (!(i = o.pmViewDesc) || i.parent != this); )
                    o = o.previousSibling;
                return o ? this.posBeforeChild(i) + i.size : this.posAtStart
            }
            var s, a;
            if (t == this.contentDOM)
                s = t.childNodes[e];
            else {
                for (; t.parentNode != this.contentDOM; )
                    t = t.parentNode;
                s = t.nextSibling
            }
            for (; s && (!(a = s.pmViewDesc) || a.parent != this); )
                s = s.nextSibling;
            return s ? this.posBeforeChild(a) : this.posAtEnd
        }
        var c;
        if (this.contentDOM && this.contentDOM != this.dom && this.dom.contains(this.contentDOM))
            c = 2 & t.compareDocumentPosition(this.contentDOM);
        else if (this.dom.firstChild) {
            if (0 == e)
                for (var l = t; ; l = l.parentNode) {
                    if (l == r.dom) {
                        c = !1;
                        break
                    }
                    if (l.parentNode.firstChild != l)
                        break
                }
            if (null == c && e == t.childNodes.length)
                for (var p = t; ; p = p.parentNode) {
                    if (p == r.dom) {
                        c = !0;
                        break
                    }
                    if (p.parentNode.lastChild != p)
                        break
                }
        }
        return (null == c ? n > 0 : c) ? this.posAtEnd : this.posAtStart
    }
    ,
    As.prototype.nearestDesc = function(t, e) {
        for (var n = this, r = !0, o = t; o; o = o.parentNode) {
            var i = n.getDesc(o);
            if (i && (!e || i.node)) {
                if (!r || !i.nodeDOM || (1 == i.nodeDOM.nodeType ? i.nodeDOM.contains(t) : i.nodeDOM == t))
                    return i;
                r = !1
            }
        }
    }
    ,
    As.prototype.getDesc = function(t) {
        for (var e = this, n = t.pmViewDesc, r = n; r; r = r.parent)
            if (r == e)
                return n
    }
    ,
    As.prototype.posFromDOM = function(t, e, n) {
        for (var r = this, o = t; ; o = o.parentNode) {
            var i = r.getDesc(o);
            if (i)
                return i.localPosFromDOM(t, e, n)
        }
    }
    ,
    As.prototype.descAt = function(t) {
        for (var e = this, n = 0, r = 0; n < this.children.length; n++) {
            var o = e.children[n]
              , i = r + o.size;
            if (r == t && i != r) {
                for (; !o.border && o.children.length; )
                    o = o.children[0];
                return o
            }
            if (t < i)
                return o.descAt(t - r - o.border);
            r = i
        }
    }
    ,
    As.prototype.domFromPos = function(t) {
        var e = this;
        if (!this.contentDOM)
            return {
                node: this.dom,
                offset: 0
            };
        for (var n = 0, r = 0; ; r++) {
            if (n == t) {
                for (; r < this.children.length && (this.children[r].beforePosition || this.children[r].dom.parentNode != this.contentDOM); )
                    r++;
                return {
                    node: e.contentDOM,
                    offset: r == e.children.length ? e.contentDOM.childNodes.length : bs(e.children[r].dom)
                }
            }
            if (r == e.children.length)
                throw new Error("Invalid position " + t);
            var o = e.children[r]
              , i = n + o.size;
            if (t < i)
                return o.domFromPos(t - n - o.border);
            n = i
        }
    }
    ,
    As.prototype.parseRange = function(t, e, n) {
        var r = this;
        if (void 0 === n && (n = 0),
        0 == this.children.length)
            return {
                node: this.contentDOM,
                from: t,
                to: e,
                fromOffset: 0,
                toOffset: this.contentDOM.childNodes.length
            };
        for (var o = -1, i = -1, s = n, a = 0; ; a++) {
            var c = r.children[a]
              , l = s + c.size;
            if (-1 == o && t <= l) {
                var p = s + c.border;
                if (t >= p && e <= l - c.border && c.node && c.contentDOM && r.contentDOM.contains(c.contentDOM))
                    return c.parseRange(t, e, p);
                t = s;
                for (var u = a; u > 0; u--) {
                    var h = r.children[u - 1];
                    if (h.size && h.dom.parentNode == r.contentDOM && !h.emptyChildAt(1)) {
                        o = bs(h.dom) + 1;
                        break
                    }
                    t -= h.size
                }
                -1 == o && (o = 0)
            }
            if (o > -1 && e <= l) {
                e = l;
                for (var f = a + 1; f < this.children.length; f++) {
                    var d = r.children[f];
                    if (d.size && d.dom.parentNode == r.contentDOM && !d.emptyChildAt(-1)) {
                        i = bs(d.dom);
                        break
                    }
                    e += d.size
                }
                -1 == i && (i = r.contentDOM.childNodes.length);
                break
            }
            s = l
        }
        return {
            node: this.contentDOM,
            from: t,
            to: e,
            fromOffset: o,
            toOffset: i
        }
    }
    ,
    As.prototype.emptyChildAt = function(t) {
        if (this.border || !this.contentDOM || !this.children.length)
            return !1;
        var e = this.children[t < 0 ? 0 : this.children.length - 1];
        return 0 == e.size || e.emptyChildAt(t)
    }
    ,
    As.prototype.domAfterPos = function(t) {
        var e = this.domFromPos(t)
          , n = e.node
          , r = e.offset;
        if (1 != n.nodeType || r == n.childNodes.length)
            throw new RangeError("No node after pos " + t);
        return n.childNodes[r]
    }
    ,
    As.prototype.setSelection = function(t, e, n, r) {
        for (var o = this, i = Math.min(t, e), s = Math.max(t, e), a = 0, c = 0; a < this.children.length; a++) {
            var l = o.children[a]
              , p = c + l.size;
            if (i > c && s < p)
                return l.setSelection(t - c - l.border, e - c - l.border, n, r);
            c = p
        }
        var u = this.domFromPos(t)
          , h = this.domFromPos(e)
          , f = n.getSelection()
          , d = document.createRange();
        if (r || !Ss(u.node, u.offset, f.anchorNode, f.anchorOffset) || !Ss(h.node, h.offset, f.focusNode, f.focusOffset)) {
            if (f.extend)
                d.setEnd(u.node, u.offset),
                d.collapse(!1);
            else {
                if (t > e) {
                    var m = u;
                    u = h,
                    h = m
                }
                d.setEnd(h.node, h.offset),
                d.setStart(u.node, u.offset)
            }
            f.removeAllRanges(),
            f.addRange(d),
            f.extend && f.extend(h.node, h.offset)
        }
    }
    ,
    As.prototype.ignoreMutation = function(t) {
        return !this.contentDOM
    }
    ,
    Is.contentLost.get = function() {
        return this.contentDOM && this.contentDOM != this.dom && !this.dom.contains(this.contentDOM)
    }
    ,
    As.prototype.markDirty = function(t, e) {
        for (var n = this, r = 0, o = 0; o < this.children.length; o++) {
            var i = n.children[o]
              , s = r + i.size;
            if (r == s ? t <= s && e >= r : t < s && e > r) {
                var a = r + i.border
                  , c = s - i.border;
                if (t >= a && e <= c)
                    return n.dirty = t == r || e == s ? 2 : 1,
                    void (t != a || e != c || !i.contentLost && i.dom.parentNode == n.contentDOM ? i.markDirty(t - a, e - a) : i.dirty = 3);
                i.dirty = 3
            }
            r = s
        }
        this.dirty = 2
    }
    ,
    As.prototype.markParentsDirty = function() {
        for (var t = this.parent; t; t = t.parent) {
            t.dirty < 2 && (t.dirty = 2)
        }
    }
    ,
    Object.defineProperties(As.prototype, Is);
    var Rs = []
      , zs = function(t) {
        function e(e, n, r, o) {
            var i, s = n.type.toDOM;
            if ("function" == typeof s && (s = s(r, function() {
                return i ? i.parent ? i.parent.posBeforeChild(i) : void 0 : o
            })),
            !n.type.spec.raw) {
                if (1 != s.nodeType) {
                    var a = document.createElement("span");
                    a.appendChild(s),
                    s = a
                }
                s.contentEditable = !1,
                s.classList.add("ProseMirror-widget")
            }
            t.call(this, e, Rs, s, null),
            this.widget = n,
            i = this
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            beforePosition: {
                configurable: !0
            }
        };
        return n.beforePosition.get = function() {
            return this.widget.type.side < 0
        }
        ,
        e.prototype.matchesWidget = function(t) {
            return 0 == this.dirty && t.type.eq(this.widget.type)
        }
        ,
        e.prototype.parseRule = function() {
            return {
                ignore: !0
            }
        }
        ,
        e.prototype.stopEvent = function(t) {
            var e = this.widget.spec.stopEvent;
            return !!e && e(t)
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(As)
      , Ps = function(t) {
        function e(e, n, r, o) {
            t.call(this, e, Rs, n, null),
            this.textDOM = r,
            this.text = o
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            size: {
                configurable: !0
            }
        };
        return n.size.get = function() {
            return this.text.length
        }
        ,
        e.prototype.localPosFromDOM = function(t, e) {
            return t != this.textDOM ? this.posAtStart + (e ? this.size : 0) : this.posAtStart + e
        }
        ,
        e.prototype.domFromPos = function(t) {
            return {
                node: this.textDOM,
                offset: t
            }
        }
        ,
        e.prototype.ignoreMutation = function(t) {
            return "characterData" === t.type && t.target.nodeValue == t.oldValue
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(As)
      , Bs = function(t) {
        function e(e, n, r, o) {
            t.call(this, e, [], r, o),
            this.mark = n
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.create = function(t, n, r, o) {
            var i = o.nodeViews[n.type.name]
              , s = i && i(n, o, r);
            return s && s.dom || (s = Ti.renderSpec(document, n.type.spec.toDOM(n, r))),
            new e(t,n,s.dom,s.contentDOM || s.dom)
        }
        ,
        e.prototype.parseRule = function() {
            return {
                mark: this.mark.type.name,
                attrs: this.mark.attrs,
                contentElement: this.contentDOM
            }
        }
        ,
        e.prototype.matchesMark = function(t) {
            return 3 != this.dirty && this.mark.eq(t)
        }
        ,
        e.prototype.markDirty = function(e, n) {
            if (t.prototype.markDirty.call(this, e, n),
            0 != this.dirty) {
                for (var r = this.parent; !r.node; )
                    r = r.parent;
                r.dirty < this.dirty && (r.dirty = this.dirty),
                this.dirty = 0
            }
        }
        ,
        e.prototype.slice = function(t, n, r) {
            var o = e.create(this.parent, this.mark, !0, r)
              , i = this.children
              , s = this.size;
            n < s && (i = we(i, n, s, r)),
            t > 0 && (i = we(i, 0, t, r));
            for (var a = 0; a < i.length; a++)
                i[a].parent = o;
            return o.children = i,
            o
        }
        ,
        e
    }(As)
      , Vs = function(t) {
        function e(e, n, r, o, i, s, a, c, l) {
            t.call(this, e, n.isLeaf ? Rs : [], i, s),
            this.nodeDOM = a,
            this.node = n,
            this.outerDeco = r,
            this.innerDeco = o,
            s && this.updateChildren(c, l)
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            size: {
                configurable: !0
            },
            border: {
                configurable: !0
            }
        };
        return e.create = function(t, n, r, o, i, s) {
            var a, c, l = i.nodeViews[n.type.name], p = l && l(n, i, function() {
                return c ? c.parent ? c.parent.posBeforeChild(c) : void 0 : s
            }, r), u = p && p.dom, h = p && p.contentDOM;
            if (n.isText)
                if (u) {
                    if (3 != u.nodeType)
                        throw new RangeError("Text must be rendered as a DOM text node")
                } else
                    u = document.createTextNode(n.text);
            else
                u || (u = (a = Ti.renderSpec(document, n.type.spec.toDOM(n))).dom,
                h = a.contentDOM);
            h || n.isText || "BR" == u.nodeName || (u.hasAttribute("contenteditable") || (u.contentEditable = !1),
            n.type.spec.draggable && (u.draggable = !0));
            var f = u;
            return u = pe(u, r, n),
            p ? c = new qs(t,n,r,o,u,h,f,p,i,s + 1) : n.isText ? new $s(t,n,r,o,u,f,i) : new e(t,n,r,o,u,h,f,i,s + 1)
        }
        ,
        e.prototype.parseRule = function() {
            var t = this;
            if (this.node.type.spec.reparseInView)
                return null;
            var e = {
                node: this.node.type.name,
                attrs: this.node.attrs
            };
            return this.node.type.spec.code && (e.preserveWhitespace = "full"),
            this.contentDOM && !this.contentLost ? e.contentElement = this.contentDOM : e.getContent = function() {
                return t.contentDOM ? Ko.empty : t.node.content
            }
            ,
            e
        }
        ,
        e.prototype.matchesNode = function(t, e, n) {
            return 0 == this.dirty && t.eq(this.node) && ue(e, this.outerDeco) && n.eq(this.innerDeco)
        }
        ,
        n.size.get = function() {
            return this.node.nodeSize
        }
        ,
        n.border.get = function() {
            return this.node.isLeaf ? 0 : 1
        }
        ,
        e.prototype.updateChildren = function(t, e) {
            var n = this
              , r = this.node.inlineContent
              , o = e
              , i = r && t.composing && this.localCompositionNode(t, e)
              , s = new Ls(this,i && i.node);
            me(this.node, this.innerDeco, function(e, i) {
                e.spec.marks ? s.syncToMarks(e.spec.marks, r, t) : e.type.side >= 0 && s.syncToMarks(i == n.node.childCount ? Go.none : n.node.child(i).marks, r, t),
                s.placeWidget(e, t, o)
            }, function(e, n, i, a) {
                s.syncToMarks(e.marks, r, t),
                s.findNodeMatch(e, n, i, a) || s.updateNextNode(e, n, i, t, a) || s.addNode(e, n, i, t, o),
                o += e.nodeSize
            }),
            s.syncToMarks(Rs, r, t),
            this.node.isTextblock && s.addTextblockHacks(),
            s.destroyRest(),
            (s.changed || 2 == this.dirty) && (i && this.protectLocalComposition(t, i),
            this.renderChildren())
        }
        ,
        e.prototype.renderChildren = function() {
            ie(this.contentDOM, this.children),
            ds.ios && ve(this.dom)
        }
        ,
        e.prototype.localCompositionNode = function(t, e) {
            var n = t.state.selection
              , r = n.from
              , o = n.to;
            if (!(!(t.state.selection instanceof Qi) || r < e || o > e + this.node.content.size)) {
                var i = t.root.getSelection()
                  , s = ge(i.focusNode, i.focusOffset);
                if (s && this.dom.contains(s.parentNode)) {
                    var a = s.nodeValue
                      , c = ye(this.node.content, a, r - e, o - e);
                    return c < 0 ? null : {
                        node: s,
                        pos: c,
                        text: a
                    }
                }
            }
        }
        ,
        e.prototype.protectLocalComposition = function(t, e) {
            var n = this
              , r = e.node
              , o = e.pos
              , i = e.text;
            if (!this.getDesc(r)) {
                for (var s = r; s.parentNode != n.contentDOM; s = s.parentNode) {
                    for (; s.previousSibling; )
                        s.parentNode.removeChild(s.previousSibling);
                    for (; s.nextSibling; )
                        s.parentNode.removeChild(s.nextSibling);
                    s.pmViewDesc && (s.pmViewDesc = null)
                }
                var a = new Ps(this,s,r,i);
                t.compositionNodes.push(a),
                this.children = we(this.children, o, o + i.length, t, a)
            }
        }
        ,
        e.prototype.update = function(t, e, n, r) {
            return !(3 == this.dirty || !t.sameMarkup(this.node)) && (this.updateInner(t, e, n, r),
            !0)
        }
        ,
        e.prototype.updateInner = function(t, e, n, r) {
            this.updateOuterDeco(e),
            this.node = t,
            this.innerDeco = n,
            this.contentDOM && this.updateChildren(r, this.posAtStart),
            this.dirty = 0
        }
        ,
        e.prototype.updateOuterDeco = function(t) {
            if (!ue(t, this.outerDeco)) {
                var e = 1 != this.nodeDOM.nodeType
                  , n = this.dom;
                this.dom = ce(this.dom, this.nodeDOM, ae(this.outerDeco, this.node, e), ae(t, this.node, e)),
                this.dom != n && (n.pmViewDesc = null,
                this.dom.pmViewDesc = this),
                this.outerDeco = t
            }
        }
        ,
        e.prototype.selectNode = function() {
            this.nodeDOM.classList.add("ProseMirror-selectednode"),
            !this.contentDOM && this.node.type.spec.draggable || (this.dom.draggable = !0)
        }
        ,
        e.prototype.deselectNode = function() {
            this.nodeDOM.classList.remove("ProseMirror-selectednode"),
            !this.contentDOM && this.node.type.spec.draggable || (this.dom.draggable = !1)
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(As)
      , $s = function(t) {
        function e(e, n, r, o, i, s, a) {
            t.call(this, e, n, r, o, i, null, s, a)
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.parseRule = function() {
            return {
                skip: this.nodeDOM.parentNode || !0
            }
        }
        ,
        e.prototype.update = function(t, e) {
            return !(3 == this.dirty || 0 != this.dirty && !this.inParent() || !t.sameMarkup(this.node)) && (this.updateOuterDeco(e),
            0 == this.dirty && t.text == this.node.text || t.text == this.nodeDOM.nodeValue || (this.nodeDOM.nodeValue = t.text),
            this.node = t,
            this.dirty = 0,
            !0)
        }
        ,
        e.prototype.inParent = function() {
            for (var t = this.parent.contentDOM, e = this.nodeDOM; e; e = e.parentNode)
                if (e == t)
                    return !0;
            return !1
        }
        ,
        e.prototype.domFromPos = function(t) {
            return {
                node: this.nodeDOM,
                offset: t
            }
        }
        ,
        e.prototype.localPosFromDOM = function(e, n, r) {
            return e == this.nodeDOM ? this.posAtStart + Math.min(n, this.node.text.length) : t.prototype.localPosFromDOM.call(this, e, n, r)
        }
        ,
        e.prototype.ignoreMutation = function(t) {
            return "characterData" != t.type && "selection" != t.type
        }
        ,
        e.prototype.slice = function(t, n, r) {
            var o = this.node.cut(t, n)
              , i = document.createTextNode(o.text);
            return new e(this.parent,o,this.outerDeco,this.innerDeco,i,i,r)
        }
        ,
        e
    }(Vs)
      , _s = function(t) {
        function e() {
            t.apply(this, arguments)
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.parseRule = function() {
            return {
                ignore: !0
            }
        }
        ,
        e.prototype.matchesHack = function() {
            return 0 == this.dirty
        }
        ,
        e
    }(As)
      , qs = function(t) {
        function e(e, n, r, o, i, s, a, c, l, p) {
            t.call(this, e, n, r, o, i, s, a, l, p),
            this.spec = c
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.update = function(e, n, r, o) {
            if (3 == this.dirty)
                return !1;
            if (this.spec.update) {
                var i = this.spec.update(e, n);
                return i && this.updateInner(e, n, r, o),
                i
            }
            return !(!this.contentDOM && !e.isLeaf) && t.prototype.update.call(this, e, n, r, o)
        }
        ,
        e.prototype.selectNode = function() {
            this.spec.selectNode ? this.spec.selectNode() : t.prototype.selectNode.call(this)
        }
        ,
        e.prototype.deselectNode = function() {
            this.spec.deselectNode ? this.spec.deselectNode() : t.prototype.deselectNode.call(this)
        }
        ,
        e.prototype.setSelection = function(e, n, r, o) {
            this.spec.setSelection ? this.spec.setSelection(e, n, r) : t.prototype.setSelection.call(this, e, n, r, o)
        }
        ,
        e.prototype.destroy = function() {
            this.spec.destroy && this.spec.destroy(),
            t.prototype.destroy.call(this)
        }
        ,
        e.prototype.stopEvent = function(t) {
            return !!this.spec.stopEvent && this.spec.stopEvent(t)
        }
        ,
        e.prototype.ignoreMutation = function(e) {
            return this.spec.ignoreMutation ? this.spec.ignoreMutation(e) : t.prototype.ignoreMutation.call(this, e)
        }
        ,
        e
    }(Vs);
    se.prototype = Object.create(null);
    var Fs = [new se]
      , Ls = function(t, e) {
        this.top = t,
        this.lock = e,
        this.index = 0,
        this.stack = [],
        this.changed = !1;
        var n = fe(t.node.content, t.children);
        this.preMatched = n.nodes,
        this.preMatchOffset = n.offset
    };
    Ls.prototype.getPreMatch = function(t) {
        return t >= this.preMatchOffset ? this.preMatched[t - this.preMatchOffset] : null
    }
    ,
    Ls.prototype.destroyBetween = function(t, e) {
        var n = this;
        if (t != e) {
            for (var r = t; r < e; r++)
                n.top.children[r].destroy();
            this.top.children.splice(t, e - t),
            this.changed = !0
        }
    }
    ,
    Ls.prototype.destroyRest = function() {
        this.destroyBetween(this.index, this.top.children.length)
    }
    ,
    Ls.prototype.syncToMarks = function(t, e, n) {
        for (var r = this, o = 0, i = this.stack.length >> 1, s = Math.min(i, t.length); o < s && (o == i - 1 ? this.top : this.stack[o + 1 << 1]).matchesMark(t[o]) && !1 !== t[o].type.spec.spanning; )
            o++;
        for (; o < i; )
            r.destroyRest(),
            r.top.dirty = 0,
            r.index = r.stack.pop(),
            r.top = r.stack.pop(),
            i--;
        for (; i < t.length; ) {
            r.stack.push(r.top, r.index + 1);
            for (var a = -1, c = this.index; c < Math.min(this.index + 3, this.top.children.length); c++)
                if (r.top.children[c].matchesMark(t[i])) {
                    a = c;
                    break
                }
            if (a > -1)
                a > r.index && (r.changed = !0,
                r.destroyBetween(r.index, a)),
                r.top = r.top.children[r.index];
            else {
                var l = Bs.create(r.top, t[i], e, n);
                r.top.children.splice(r.index, 0, l),
                r.top = l,
                r.changed = !0
            }
            r.index = 0,
            i++
        }
    }
    ,
    Ls.prototype.findNodeMatch = function(t, e, n, r) {
        var o = this
          , i = -1
          , s = r < 0 ? void 0 : this.getPreMatch(r)
          , a = this.top.children;
        if (s && s.matchesNode(t, e, n))
            i = a.indexOf(s);
        else
            for (var c = this.index, l = Math.min(a.length, c + 5); c < l; c++) {
                var p = a[c];
                if (p.matchesNode(t, e, n) && o.preMatched.indexOf(p) < 0) {
                    i = c;
                    break
                }
            }
        return !(i < 0) && (this.destroyBetween(this.index, i),
        this.index++,
        !0)
    }
    ,
    Ls.prototype.updateNextNode = function(t, e, n, r, o) {
        if (this.index == this.top.children.length)
            return !1;
        var i = this.top.children[this.index];
        if (i instanceof Vs) {
            var s = this.preMatched.indexOf(i);
            if (s > -1 && s + this.preMatchOffset != o)
                return !1;
            var a = i.dom;
            if (!(this.lock && (a == this.lock || 1 == a.nodeType && a.contains(this.lock.parentNode)) && !(t.isText && i.node && i.node.isText && i.nodeDOM.nodeValue == t.text && 3 != i.dirty && ue(e, i.outerDeco))) && i.update(t, e, n, r))
                return i.dom != a && (this.changed = !0),
                this.index++,
                !0
        }
        return !1
    }
    ,
    Ls.prototype.addNode = function(t, e, n, r, o) {
        this.top.children.splice(this.index++, 0, Vs.create(this.top, t, e, n, r, o)),
        this.changed = !0
    }
    ,
    Ls.prototype.placeWidget = function(t, e, n) {
        if (this.index < this.top.children.length && this.top.children[this.index].matchesWidget(t))
            this.index++;
        else {
            var r = new zs(this.top,t,e,n);
            this.top.children.splice(this.index++, 0, r),
            this.changed = !0
        }
    }
    ,
    Ls.prototype.addTextblockHacks = function() {
        for (var t = this.top.children[this.index - 1]; t instanceof Bs; )
            t = t.children[t.children.length - 1];
        if (!t || !(t instanceof $s) || /\n$/.test(t.node.text))
            if (this.index < this.top.children.length && this.top.children[this.index].matchesHack())
                this.index++;
            else {
                var e = document.createElement("br");
                this.top.children.splice(this.index++, 0, new _s(this.top,Rs,e,null)),
                this.changed = !0
            }
    }
    ;
    var js = ds.safari || ds.chrome && ds.chrome_version < 63
      , Js = {
        thead: ["table"],
        colgroup: ["table"],
        col: ["table", "colgroup"],
        tr: ["table", "tbody"],
        td: ["table", "tbody", "tr"],
        th: ["table", "tbody", "tr"]
    }
      , Ws = null
      , Ks = {
        childList: !0,
        characterData: !0,
        characterDataOldValue: !0,
        attributes: !0,
        attributeOldValue: !0,
        subtree: !0
    }
      , Hs = ds.ie && ds.ie_version <= 11
      , Us = function() {
        this.anchorNode = this.anchorOffset = this.focusNode = this.focusOffset = null
    };
    Us.prototype.set = function(t) {
        this.anchorNode = t.anchorNode,
        this.anchorOffset = t.anchorOffset,
        this.focusNode = t.focusNode,
        this.focusOffset = t.focusOffset
    }
    ,
    Us.prototype.eq = function(t) {
        return t.anchorNode == this.anchorNode && t.anchorOffset == this.anchorOffset && t.focusNode == this.focusNode && t.focusOffset == this.focusOffset
    }
    ;
    var Gs = function(t, e) {
        var n = this;
        this.view = t,
        this.handleDOMChange = e,
        this.queue = [],
        this.flushingSoon = !1,
        this.observer = window.MutationObserver && new window.MutationObserver(function(t) {
            for (var e = 0; e < t.length; e++)
                n.queue.push(t[e]);
            ds.ie && ds.ie_version <= 11 && t.some(function(t) {
                return "childList" == t.type && t.removedNodes.length || "characterData" == t.type && t.oldValue.length > t.target.nodeValue.length
            }) ? n.flushSoon() : n.flush()
        }
        ),
        this.currentSelection = new Us,
        Hs && (this.onCharData = function(t) {
            n.queue.push({
                target: t.target,
                type: "characterData",
                oldValue: t.prevValue
            }),
            n.flushSoon()
        }
        ),
        this.onSelectionChange = this.onSelectionChange.bind(this),
        this.suppressingSelectionUpdates = !1
    };
    Gs.prototype.flushSoon = function() {
        var t = this;
        this.flushingSoon || (this.flushingSoon = !0,
        window.setTimeout(function() {
            t.flushingSoon = !1,
            t.flush()
        }, 20))
    }
    ,
    Gs.prototype.start = function() {
        this.observer && this.observer.observe(this.view.dom, Ks),
        Hs && this.view.dom.addEventListener("DOMCharacterDataModified", this.onCharData),
        this.connectSelection()
    }
    ,
    Gs.prototype.stop = function() {
        var t = this
          , e = this;
        if (this.observer) {
            var n = this.observer.takeRecords();
            if (n.length) {
                for (var r = 0; r < n.length; r++)
                    t.queue.push(n[r]);
                window.setTimeout(function() {
                    return e.flush()
                }, 20)
            }
            this.observer.disconnect()
        }
        Hs && this.view.dom.removeEventListener("DOMCharacterDataModified", this.onCharData),
        this.disconnectSelection()
    }
    ,
    Gs.prototype.connectSelection = function() {
        this.view.dom.ownerDocument.addEventListener("selectionchange", this.onSelectionChange)
    }
    ,
    Gs.prototype.disconnectSelection = function() {
        this.view.dom.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange)
    }
    ,
    Gs.prototype.suppressSelectionUpdates = function() {
        var t = this;
        this.suppressingSelectionUpdates = !0,
        setTimeout(function() {
            return t.suppressingSelectionUpdates = !1
        }, 50)
    }
    ,
    Gs.prototype.onSelectionChange = function() {
        if (je(this.view)) {
            if (this.suppressingSelectionUpdates)
                return Be(this.view);
            if (ds.ie && ds.ie_version <= 11 && !this.view.state.selection.empty) {
                var t = this.view.root.getSelection();
                if (t.focusNode && Ss(t.focusNode, t.focusOffset, t.anchorNode, t.anchorOffset))
                    return this.flushSoon()
            }
            this.flush()
        }
    }
    ,
    Gs.prototype.setCurSelection = function() {
        this.currentSelection.set(this.view.root.getSelection())
    }
    ,
    Gs.prototype.ignoreSelectionChange = function(t) {
        if (0 == t.rangeCount)
            return !0;
        var e = t.getRangeAt(0).commonAncestorContainer
          , n = this.view.docView.nearestDesc(e);
        return n && n.ignoreMutation({
            type: "selection",
            target: 3 == e.nodeType ? e.parentNode : e
        })
    }
    ,
    Gs.prototype.flush = function() {
        var t = this;
        if (this.view.docView && !this.flushingSoon) {
            var e = this.observer ? this.observer.takeRecords() : [];
            this.queue.length && (e = this.queue.concat(e),
            this.queue.length = 0);
            var n = this.view.root.getSelection()
              , r = !this.suppressingSelectionUpdates && !this.currentSelection.eq(n) && Je(this.view) && !this.ignoreSelectionChange(n)
              , o = -1
              , i = -1
              , s = !1
              , a = [];
            if (this.view.editable)
                for (var c = 0; c < e.length; c++) {
                    var l = t.registerMutation(e[c], a);
                    l && (o = o < 0 ? l.from : Math.min(l.from, o),
                    i = i < 0 ? l.to : Math.max(l.to, i),
                    l.typeOver && !t.view.composing && (s = !0))
                }
            if (ds.gecko && a.length > 1) {
                var p = a.filter(function(t) {
                    return "BR" == t.nodeName
                });
                if (2 == p.length) {
                    var u = p[0]
                      , h = p[1];
                    u.parentNode && u.parentNode.parentNode == h.parentNode ? h.remove() : u.remove()
                }
            }
            (o > -1 || r) && (o > -1 && (this.view.docView.markDirty(o, i),
            hn(this.view)),
            this.handleDOMChange(o, i, s),
            this.view.docView.dirty ? this.view.updateState(this.view.state) : this.currentSelection.eq(n) || Be(this.view))
        }
    }
    ,
    Gs.prototype.registerMutation = function(t, e) {
        if (e.indexOf(t.target) > -1)
            return null;
        var n = this.view.docView.nearestDesc(t.target);
        if ("attributes" == t.type && (n == this.view.docView || "contenteditable" == t.attributeName || "style" == t.attributeName && !t.oldValue && !t.target.getAttribute("style")))
            return null;
        if (!n || n.ignoreMutation(t))
            return null;
        if ("childList" == t.type) {
            var r = t.previousSibling
              , o = t.nextSibling;
            if (ds.ie && ds.ie_version <= 11 && t.addedNodes.length)
                for (var i = 0; i < t.addedNodes.length; i++) {
                    var s = t.addedNodes[i]
                      , a = s.previousSibling
                      , c = s.nextSibling;
                    (!a || Array.prototype.indexOf.call(t.addedNodes, a) < 0) && (r = a),
                    (!c || Array.prototype.indexOf.call(t.addedNodes, c) < 0) && (o = c)
                }
            for (var l = r && r.parentNode == t.target ? bs(r) + 1 : 0, p = n.localPosFromDOM(t.target, l, -1), u = o && o.parentNode == t.target ? bs(o) : t.target.childNodes.length, h = 0; h < t.addedNodes.length; h++)
                e.push(t.addedNodes[h]);
            return {
                from: p,
                to: n.localPosFromDOM(t.target, u, 1)
            }
        }
        return "attributes" == t.type ? {
            from: n.posAtStart - n.border,
            to: n.posAtEnd + n.border
        } : {
            from: n.posAtStart,
            to: n.posAtEnd,
            typeOver: t.target.nodeValue == t.oldValue
        }
    }
    ;
    var Qs = !1
      , Xs = {}
      , Ys = {};
    Ys.keydown = function(t, e) {
        t.shiftKey = 16 == e.keyCode || e.shiftKey,
        An(t, e) || (t.lastKeyCode = e.keyCode,
        t.lastKeyCodeTime = Date.now(),
        t.someProp("handleKeyDown", function(n) {
            return n(t, e)
        }) || ze(t, e) ? e.preventDefault() : dn(t, "key"))
    }
    ,
    Ys.keyup = function(t, e) {
        16 == e.keyCode && (t.shiftKey = !1)
    }
    ,
    Ys.keypress = function(t, e) {
        if (!(An(t, e) || !e.charCode || e.ctrlKey && !e.altKey || ds.mac && e.metaKey))
            if (t.someProp("handleKeyPress", function(n) {
                return n(t, e)
            }))
                e.preventDefault();
            else {
                var n = t.state.selection;
                if (!(n instanceof Qi && n.$from.sameParent(n.$to))) {
                    var r = String.fromCharCode(e.charCode);
                    t.someProp("handleTextInput", function(e) {
                        return e(t, n.$from.pos, n.$to.pos, r)
                    }) || t.dispatch(t.state.tr.insertText(r).scrollIntoView()),
                    e.preventDefault()
                }
            }
    }
    ;
    var Zs = ds.mac ? "metaKey" : "ctrlKey";
    Xs.mousedown = function(t, e) {
        t.shiftKey = e.shiftKey;
        var n = En(t)
          , r = Date.now()
          , o = "singleClick";
        r - t.lastClick.time < 500 && kn(e, t.lastClick) && !e[Zs] && ("singleClick" == t.lastClick.type ? o = "doubleClick" : "doubleClick" == t.lastClick.type && (o = "tripleClick")),
        t.lastClick = {
            time: r,
            x: e.clientX,
            y: e.clientY,
            type: o
        };
        var i = t.posAtCoords(bn(e));
        i && ("singleClick" == o ? t.mouseDown = new ta(t,i,e,n) : ("doubleClick" == o ? Nn : Tn)(t, i.pos, i.inside, e) ? e.preventDefault() : dn(t, "pointer"))
    }
    ;
    var ta = function(t, e, n, r) {
        var o = this;
        this.view = t,
        this.startDoc = t.state.doc,
        this.pos = e,
        this.event = n,
        this.flushed = r,
        this.selectNode = n[Zs],
        this.allowDefault = n.shiftKey;
        var i, s;
        if (e.inside > -1)
            i = t.state.doc.nodeAt(e.inside),
            s = e.inside;
        else {
            var a = t.state.doc.resolve(e.pos);
            i = a.parent,
            s = a.depth ? a.before() : 0
        }
        this.mightDrag = null;
        var c = r ? null : n.target
          , l = c ? t.docView.nearestDesc(c, !0) : null;
        this.target = l ? l.dom : null,
        (i.type.spec.draggable && !1 !== i.type.spec.selectable || t.state.selection instanceof Yi && s == t.state.selection.from) && (this.mightDrag = {
            node: i,
            pos: s,
            addAttr: this.target && !this.target.draggable,
            setUneditable: this.target && ds.gecko && !this.target.hasAttribute("contentEditable")
        }),
        this.target && this.mightDrag && (this.mightDrag.addAttr || this.mightDrag.setUneditable) && (this.view.domObserver.stop(),
        this.mightDrag.addAttr && (this.target.draggable = !0),
        this.mightDrag.setUneditable && setTimeout(function() {
            return o.target.setAttribute("contentEditable", "false")
        }, 20),
        this.view.domObserver.start()),
        t.root.addEventListener("mouseup", this.up = this.up.bind(this)),
        t.root.addEventListener("mousemove", this.move = this.move.bind(this)),
        dn(t, "pointer")
    };
    ta.prototype.done = function() {
        this.view.root.removeEventListener("mouseup", this.up),
        this.view.root.removeEventListener("mousemove", this.move),
        this.mightDrag && this.target && (this.view.domObserver.stop(),
        this.mightDrag.addAttr && (this.target.draggable = !1),
        this.mightDrag.setUneditable && this.target.removeAttribute("contentEditable"),
        this.view.domObserver.start()),
        this.view.mouseDown = null
    }
    ,
    ta.prototype.up = function(t) {
        if (this.done(),
        this.view.dom.contains(3 == t.target.nodeType ? t.target.parentNode : t.target)) {
            var e = this.pos;
            this.view.state.doc != this.startDoc && (e = this.view.posAtCoords(bn(t))),
            this.allowDefault || !e ? dn(this.view, "pointer") : On(this.view, e.pos, e.inside, t, this.selectNode) ? t.preventDefault() : !this.flushed && (!ds.chrome || this.view.state.selection instanceof Qi || e.pos != this.view.state.selection.from && e.pos != this.view.state.selection.to) ? dn(this.view, "pointer") : (Sn(this.view, Hi.near(this.view.state.doc.resolve(e.pos)), "pointer"),
            t.preventDefault())
        }
    }
    ,
    ta.prototype.move = function(t) {
        !this.allowDefault && (Math.abs(this.event.x - t.clientX) > 4 || Math.abs(this.event.y - t.clientY) > 4) && (this.allowDefault = !0),
        dn(this.view, "pointer")
    }
    ,
    Xs.touchdown = function(t) {
        En(t),
        dn(t, "pointer")
    }
    ,
    Xs.contextmenu = function(t) {
        return En(t)
    }
    ;
    var ea = ds.android ? 5e3 : -1;
    Ys.compositionstart = Ys.compositionupdate = function(t) {
        if (!t.composing) {
            t.domObserver.flush();
            var e = t.state
              , n = e.selection.$from;
            if (e.selection.empty && (e.storedMarks || !n.textOffset && n.parentOffset && n.nodeBefore.marks.some(function(t) {
                return !1 === t.type.spec.inclusive
            })))
                t.markCursor = t.state.storedMarks || n.marks(),
                Rn(t, !0),
                t.markCursor = null;
            else if (Rn(t),
            ds.gecko && e.selection.empty && n.parentOffset && !n.textOffset && n.nodeBefore.marks.length)
                for (var r = t.root.getSelection(), o = r.focusNode, i = r.focusOffset; o && 1 == o.nodeType && 0 != i; ) {
                    var s = i < 0 ? o.lastChild : o.childNodes[i - 1];
                    if (3 == s.nodeType) {
                        r.collapse(s, s.nodeValue.length);
                        break
                    }
                    o = s,
                    i = -1
                }
            t.composing = !0
        }
        In(t, ea)
    }
    ,
    Ys.compositionend = function(t, e) {
        t.composing && (t.composing = !1,
        t.compositionEndedAt = e.timeStamp,
        In(t, 20))
    }
    ;
    var na = ds.ie && ds.ie_version < 15 || ds.ios && ds.webkit_version < 604;
    Xs.copy = Ys.cut = function(t, e) {
        var n = t.state.selection
          , r = "cut" == e.type;
        if (!n.empty) {
            var o = na ? null : e.clipboardData
              , i = tn(t, n.content())
              , s = i.dom
              , a = i.text;
            o ? (e.preventDefault(),
            o.clearData(),
            o.setData("text/html", s.innerHTML),
            o.setData("text/plain", a)) : zn(t, s),
            r && t.dispatch(t.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"))
        }
    }
    ,
    Ys.paste = function(t, e) {
        var n = na ? null : e.clipboardData
          , r = n && n.getData("text/html")
          , o = n && n.getData("text/plain");
        n && (r || o || n.files.length) ? (Vn(t, o, r, e),
        e.preventDefault()) : Bn(t, e)
    }
    ;
    var ra = function(t, e) {
        this.slice = t,
        this.move = e
    }
      , oa = ds.mac ? "altKey" : "ctrlKey";
    Xs.dragstart = function(t, e) {
        var n = t.mouseDown;
        if (n && n.done(),
        e.dataTransfer) {
            var r = t.state.selection
              , o = r.empty ? null : t.posAtCoords(bn(e));
            if (o && o.pos >= r.from && o.pos <= (r instanceof Yi ? r.to - 1 : r.to))
                ;
            else if (n && n.mightDrag)
                t.dispatch(t.state.tr.setSelection(Yi.create(t.state.doc, n.mightDrag.pos)));
            else if (e.target && 1 == e.target.nodeType) {
                var i = t.docView.nearestDesc(e.target, !0);
                if (!i || !i.node.type.spec.draggable || i == t.docView)
                    return;
                t.dispatch(t.state.tr.setSelection(Yi.create(t.state.doc, i.posBefore)))
            }
            var s = t.state.selection.content()
              , a = tn(t, s)
              , c = a.dom
              , l = a.text;
            e.dataTransfer.clearData(),
            e.dataTransfer.setData(na ? "Text" : "text/html", c.innerHTML),
            na || e.dataTransfer.setData("text/plain", l),
            t.dragging = new ra(s,!e[oa])
        }
    }
    ,
    Xs.dragend = function(t) {
        window.setTimeout(function() {
            return t.dragging = null
        }, 50)
    }
    ,
    Ys.dragover = Ys.dragenter = function(t, e) {
        return e.preventDefault()
    }
    ,
    Ys.drop = function(t, e) {
        var n = t.dragging;
        if (t.dragging = null,
        e.dataTransfer) {
            var r = t.posAtCoords(bn(e));
            if (r) {
                var o = t.state.doc.resolve(r.pos);
                if (o) {
                    var i = n && n.slice || en(t, e.dataTransfer.getData(na ? "Text" : "text/plain"), na ? null : e.dataTransfer.getData("text/html"), !1, o);
                    if (i && (e.preventDefault(),
                    !t.someProp("handleDrop", function(r) {
                        return r(t, e, i, n && n.move)
                    }))) {
                        var s = i ? st(t.state.doc, o.pos, i) : o.pos;
                        null == s && (s = o.pos);
                        var a = t.state.tr;
                        n && n.move && a.deleteSelection();
                        var c = a.mapping.map(s)
                          , l = 0 == i.openStart && 0 == i.openEnd && 1 == i.content.childCount
                          , p = a.doc;
                        if (l ? a.replaceRangeWith(c, c, i.content.firstChild) : a.replaceRange(c, c, i),
                        !a.doc.eq(p)) {
                            var u = a.doc.resolve(c);
                            l && Yi.isSelectable(i.content.firstChild) && u.nodeAfter && u.nodeAfter.sameMarkup(i.content.firstChild) ? a.setSelection(new Yi(u)) : a.setSelection(Le(t, u, a.doc.resolve(a.mapping.map(s)))),
                            t.focus(),
                            t.dispatch(a.setMeta("uiEvent", "drop"))
                        }
                    }
                }
            }
        }
    }
    ,
    Xs.focus = function(t) {
        t.focused || (t.domObserver.stop(),
        t.dom.classList.add("ProseMirror-focused"),
        t.domObserver.start(),
        t.focused = !0)
    }
    ,
    Xs.blur = function(t) {
        t.focused && (t.domObserver.stop(),
        t.dom.classList.remove("ProseMirror-focused"),
        t.domObserver.start(),
        t.domObserver.currentSelection.set({}),
        t.focused = !1)
    }
    ,
    Xs.beforeinput = function(t, e) {
        if (ds.chrome && ds.android && "deleteContentBackward" == e.inputType) {
            var n = t.domChangeCount;
            setTimeout(function() {
                if (t.domChangeCount == n && (t.dom.blur(),
                t.focus(),
                !t.someProp("handleKeyDown", function(e) {
                    return e(t, Rt(8, "Backspace"))
                }))) {
                    var e = t.state.selection.$cursor;
                    e && e.pos > 0 && t.dispatch(t.state.tr.delete(e.pos - 1, e.pos).scrollIntoView())
                }
            }, 50)
        }
    }
    ;
    for (var ia in Ys)
        Xs[ia] = Ys[ia];
    var sa = function(t, e) {
        this.spec = e || ha,
        this.side = this.spec.side || 0,
        this.toDOM = t
    };
    sa.prototype.map = function(t, e, n, r) {
        var o = t.mapResult(e.from + r, this.side < 0 ? -1 : 1)
          , i = o.pos;
        return o.deleted ? null : new la(i - n,i - n,this)
    }
    ,
    sa.prototype.valid = function() {
        return !0
    }
    ,
    sa.prototype.eq = function(t) {
        return this == t || t instanceof sa && (this.spec.key && this.spec.key == t.spec.key || this.toDOM == t.toDOM && $n(this.spec, t.spec))
    }
    ;
    var aa = function(t, e) {
        this.spec = e || ha,
        this.attrs = t
    };
    aa.prototype.map = function(t, e, n, r) {
        var o = t.map(e.from + r, this.spec.inclusiveStart ? -1 : 1) - n
          , i = t.map(e.to + r, this.spec.inclusiveEnd ? 1 : -1) - n;
        return o >= i ? null : new la(o,i,this)
    }
    ,
    aa.prototype.valid = function(t, e) {
        return e.from < e.to
    }
    ,
    aa.prototype.eq = function(t) {
        return this == t || t instanceof aa && $n(this.attrs, t.attrs) && $n(this.spec, t.spec)
    }
    ,
    aa.is = function(t) {
        return t.type instanceof aa
    }
    ;
    var ca = function(t, e) {
        this.spec = e || ha,
        this.attrs = t
    };
    ca.prototype.map = function(t, e, n, r) {
        var o = t.mapResult(e.from + r, 1);
        if (o.deleted)
            return null;
        var i = t.mapResult(e.to + r, -1);
        return i.deleted || i.pos <= o.pos ? null : new la(o.pos - n,i.pos - n,this)
    }
    ,
    ca.prototype.valid = function(t, e) {
        var n = t.content.findIndex(e.from)
          , r = n.index
          , o = n.offset;
        return o == e.from && o + t.child(r).nodeSize == e.to
    }
    ,
    ca.prototype.eq = function(t) {
        return this == t || t instanceof ca && $n(this.attrs, t.attrs) && $n(this.spec, t.spec)
    }
    ;
    var la = function(t, e, n) {
        this.from = t,
        this.to = e,
        this.type = n
    }
      , pa = {
        spec: {
            configurable: !0
        }
    };
    la.prototype.copy = function(t, e) {
        return new la(t,e,this.type)
    }
    ,
    la.prototype.eq = function(t) {
        return this.type.eq(t.type) && this.from == t.from && this.to == t.to
    }
    ,
    la.prototype.map = function(t, e, n) {
        return this.type.map(t, this, e, n)
    }
    ,
    la.widget = function(t, e, n) {
        return new la(t,t,new sa(e,n))
    }
    ,
    la.inline = function(t, e, n, r) {
        return new la(t,e,new aa(n,r))
    }
    ,
    la.node = function(t, e, n, r) {
        return new la(t,e,new ca(n,r))
    }
    ,
    pa.spec.get = function() {
        return this.type.spec
    }
    ,
    Object.defineProperties(la.prototype, pa);
    var ua = []
      , ha = {}
      , fa = function(t, e) {
        this.local = t && t.length ? t : ua,
        this.children = e && e.length ? e : ua
    };
    fa.create = function(t, e) {
        return e.length ? Jn(e, t, 0, ha) : da
    }
    ,
    fa.prototype.find = function(t, e, n) {
        var r = [];
        return this.findInner(null == t ? 0 : t, null == e ? 1e9 : e, r, 0, n),
        r
    }
    ,
    fa.prototype.findInner = function(t, e, n, r, o) {
        for (var i = this, s = 0; s < this.local.length; s++) {
            var a = i.local[s];
            a.from <= e && a.to >= t && (!o || o(a.spec)) && n.push(a.copy(a.from + r, a.to + r))
        }
        for (var c = 0; c < this.children.length; c += 3)
            if (i.children[c] < e && i.children[c + 1] > t) {
                var l = i.children[c] + 1;
                i.children[c + 2].findInner(t - l, e - l, n, r + l, o)
            }
    }
    ,
    fa.prototype.map = function(t, e, n) {
        return this == da || 0 == t.maps.length ? this : this.mapInner(t, e, 0, 0, n || ha)
    }
    ,
    fa.prototype.mapInner = function(t, e, n, r, o) {
        for (var i, s = this, a = 0; a < this.local.length; a++) {
            var c = s.local[a].map(t, n, r);
            c && c.type.valid(e, c) ? (i || (i = [])).push(c) : o.onRemove && o.onRemove(s.local[a].spec)
        }
        return this.children.length ? _n(this.children, i, t, e, n, r, o) : i ? new fa(i.sort(Wn)) : da
    }
    ,
    fa.prototype.add = function(t, e) {
        return e.length ? this == da ? fa.create(t, e) : this.addInner(t, e, 0) : this
    }
    ,
    fa.prototype.addInner = function(t, e, n) {
        var r, o = this, i = 0;
        t.forEach(function(t, s) {
            var a, c = s + n;
            if (a = Ln(e, t, c)) {
                for (r || (r = o.children.slice()); i < r.length && r[i] < s; )
                    i += 3;
                r[i] == s ? r[i + 2] = r[i + 2].addInner(t, a, c + 1) : r.splice(i, 0, s, s + t.nodeSize, Jn(a, t, c + 1, ha)),
                i += 3
            }
        });
        var s = qn(i ? jn(e) : e, -n);
        return new fa(s.length ? this.local.concat(s).sort(Wn) : this.local,r || this.children)
    }
    ,
    fa.prototype.remove = function(t) {
        return 0 == t.length || this == da ? this : this.removeInner(t, 0)
    }
    ,
    fa.prototype.removeInner = function(t, e) {
        for (var n = this, r = this.children, o = this.local, i = 0; i < r.length; i += 3) {
            for (var s = void 0, a = r[i] + e, c = r[i + 1] + e, l = 0, p = void 0; l < t.length; l++)
                (p = t[l]) && p.from > a && p.to < c && (t[l] = null,
                (s || (s = [])).push(p));
            if (s) {
                r == n.children && (r = n.children.slice());
                var u = r[i + 2].removeInner(s, a + 1);
                u != da ? r[i + 2] = u : (r.splice(i, 3),
                i -= 3)
            }
        }
        if (o.length)
            for (var h = 0, f = void 0; h < t.length; h++)
                if (f = t[h])
                    for (var d = 0; d < o.length; d++)
                        o[d].type.eq(f.type) && (o == n.local && (o = n.local.slice()),
                        o.splice(d--, 1));
        return r == this.children && o == this.local ? this : o.length || r.length ? new fa(o,r) : da
    }
    ,
    fa.prototype.forChild = function(t, e) {
        var n = this;
        if (this == da)
            return this;
        if (e.isLeaf)
            return fa.empty;
        for (var r, o, i = 0; i < this.children.length; i += 3)
            if (n.children[i] >= t) {
                n.children[i] == t && (r = n.children[i + 2]);
                break
            }
        for (var s = t + 1, a = s + e.content.size, c = 0; c < this.local.length; c++) {
            var l = n.local[c];
            if (l.from < a && l.to > s && l.type instanceof aa) {
                var p = Math.max(s, l.from) - s
                  , u = Math.min(a, l.to) - s;
                p < u && (o || (o = [])).push(l.copy(p, u))
            }
        }
        if (o) {
            var h = new fa(o.sort(Wn));
            return r ? new ma([h, r]) : h
        }
        return r || da
    }
    ,
    fa.prototype.eq = function(t) {
        var e = this;
        if (this == t)
            return !0;
        if (!(t instanceof fa) || this.local.length != t.local.length || this.children.length != t.children.length)
            return !1;
        for (var n = 0; n < this.local.length; n++)
            if (!e.local[n].eq(t.local[n]))
                return !1;
        for (var r = 0; r < this.children.length; r += 3)
            if (e.children[r] != t.children[r] || e.children[r + 1] != t.children[r + 1] || !e.children[r + 2].eq(t.children[r + 2]))
                return !1;
        return !0
    }
    ,
    fa.prototype.locals = function(t) {
        return Kn(this.localsInner(t))
    }
    ,
    fa.prototype.localsInner = function(t) {
        var e = this;
        if (this == da)
            return ua;
        if (t.inlineContent || !this.local.some(aa.is))
            return this.local;
        for (var n = [], r = 0; r < this.local.length; r++)
            e.local[r].type instanceof aa || n.push(e.local[r]);
        return n
    }
    ;
    var da = new fa;
    fa.empty = da,
    fa.removeOverlap = Kn;
    var ma = function(t) {
        this.members = t
    };
    ma.prototype.forChild = function(t, e) {
        var n = this;
        if (e.isLeaf)
            return fa.empty;
        for (var r = [], o = 0; o < this.members.length; o++) {
            var i = n.members[o].forChild(t, e);
            i != da && (i instanceof ma ? r = r.concat(i.members) : r.push(i))
        }
        return ma.from(r)
    }
    ,
    ma.prototype.eq = function(t) {
        var e = this;
        if (!(t instanceof ma) || t.members.length != this.members.length)
            return !1;
        for (var n = 0; n < this.members.length; n++)
            if (!e.members[n].eq(t.members[n]))
                return !1;
        return !0
    }
    ,
    ma.prototype.locals = function(t) {
        for (var e, n = this, r = !0, o = 0; o < this.members.length; o++) {
            var i = n.members[o].localsInner(t);
            if (i.length)
                if (e) {
                    r && (e = e.slice(),
                    r = !1);
                    for (var s = 0; s < i.length; s++)
                        e.push(i[s])
                } else
                    e = i
        }
        return e ? Kn(r ? e : e.sort(Wn)) : ua
    }
    ,
    ma.from = function(t) {
        switch (t.length) {
        case 0:
            return da;
        case 1:
            return t[0];
        default:
            return new ma(t)
        }
    }
    ;
    var va = function(t, e) {
        this._props = e,
        this.state = e.state,
        this.dispatch = this.dispatch.bind(this),
        this._root = null,
        this.focused = !1,
        this.dom = t && t.mount || document.createElement("div"),
        t && (t.appendChild ? t.appendChild(this.dom) : t.apply ? t(this.dom) : t.mount && (this.mounted = !0)),
        this.editable = Xn(this),
        this.markCursor = null,
        this.cursorWrapper = null,
        Qn(this),
        this.nodeViews = Zn(this),
        this.docView = oe(this.state.doc, Gn(this), Un(this), this.dom, this),
        this.lastSelectedViewDesc = null,
        this.dragging = null,
        fn(this),
        this.pluginViews = [],
        this.updatePluginViews()
    }
      , ga = {
        props: {
            configurable: !0
        },
        root: {
            configurable: !0
        }
    };
    ga.props.get = function() {
        var t = this;
        if (this._props.state != this.state) {
            var e = this._props;
            this._props = {};
            for (var n in e)
                t._props[n] = e[n];
            this._props.state = this.state
        }
        return this._props
    }
    ,
    va.prototype.update = function(t) {
        t.handleDOMEvents != this._props.handleDOMEvents && vn(this),
        this._props = t,
        this.updateStateInner(t.state, !0)
    }
    ,
    va.prototype.setProps = function(t) {
        var e = this
          , n = {};
        for (var r in e._props)
            n[r] = e._props[r];
        n.state = this.state;
        for (var o in t)
            n[o] = t[o];
        this.update(n)
    }
    ,
    va.prototype.updateState = function(t) {
        this.updateStateInner(t, this.state.plugins != t.plugins)
    }
    ,
    va.prototype.updateStateInner = function(t, e) {
        var n = this
          , r = this.state
          , o = !1;
        if (this.state = t,
        e) {
            var i = Zn(this);
            tr(i, this.nodeViews) && (this.nodeViews = i,
            o = !0),
            vn(this)
        }
        this.editable = Xn(this),
        Qn(this);
        var s = Un(this)
          , a = Gn(this)
          , c = e ? "reset" : t.scrollToSelection > r.scrollToSelection ? "to selection" : "preserve"
          , l = o || !this.docView.matchesNode(t.doc, a, s)
          , p = l || !t.selection.eq(r.selection)
          , u = "preserve" == c && p && null == this.dom.style.overflowAnchor && Vt(this);
        if (p) {
            this.domObserver.stop();
            var h = l && (ds.ie || ds.chrome) && !r.selection.empty && !t.selection.empty && Yn(r.selection, t.selection);
            l && (!o && this.docView.update(t.doc, a, s, this) || (this.docView.destroy(),
            this.docView = oe(t.doc, a, s, this.dom, this))),
            h || !(this.mouseDown && this.domObserver.currentSelection.eq(this.root.getSelection()) && We(this)) ? Be(this, h) : (qe(this, t.selection),
            this.domObserver.setCurSelection()),
            this.domObserver.start()
        }
        if (this.updatePluginViews(r),
        "reset" == c)
            this.dom.scrollTop = 0;
        else if ("to selection" == c) {
            var f = this.root.getSelection().focusNode;
            this.someProp("handleScrollToSelection", function(t) {
                return t(n)
            }) || (t.selection instanceof Yi ? Bt(this, this.docView.domAfterPos(t.selection.from).getBoundingClientRect(), f) : Bt(this, this.coordsAtPos(t.selection.head), f))
        } else
            u && _t(u)
    }
    ,
    va.prototype.destroyPluginViews = function() {
        for (var t; t = this.pluginViews.pop(); )
            t.destroy && t.destroy()
    }
    ,
    va.prototype.updatePluginViews = function(t) {
        var e = this;
        if (t && t.plugins == this.state.plugins)
            for (var n = 0; n < this.pluginViews.length; n++) {
                var r = e.pluginViews[n];
                r.update && r.update(e, t)
            }
        else {
            this.destroyPluginViews();
            for (var o = 0; o < this.state.plugins.length; o++) {
                var i = e.state.plugins[o];
                i.spec.view && e.pluginViews.push(i.spec.view(e))
            }
        }
    }
    ,
    va.prototype.someProp = function(t, e) {
        var n, r = this._props && this._props[t];
        if (null != r && (n = e ? e(r) : r))
            return n;
        var o = this.state.plugins;
        if (o)
            for (var i = 0; i < o.length; i++) {
                var s = o[i].props[t];
                if (null != s && (n = e ? e(s) : s))
                    return n
            }
    }
    ,
    va.prototype.hasFocus = function() {
        return this.root.activeElement == this.dom
    }
    ,
    va.prototype.focus = function() {
        this.domObserver.stop(),
        this.editable && Ft(this.dom),
        Be(this),
        this.domObserver.start()
    }
    ,
    ga.root.get = function() {
        var t = this
          , e = this._root;
        if (null == e)
            for (var n = this.dom.parentNode; n; n = n.parentNode)
                if (9 == n.nodeType || 11 == n.nodeType && n.host)
                    return n.getSelection || (Object.getPrototypeOf(n).getSelection = function() {
                        return document.getSelection()
                    }
                    ),
                    t._root = n;
        return e || document
    }
    ,
    va.prototype.posAtCoords = function(t) {
        return Gt(this, t)
    }
    ,
    va.prototype.coordsAtPos = function(t) {
        return Xt(this, t)
    }
    ,
    va.prototype.domAtPos = function(t) {
        return this.docView.domFromPos(t)
    }
    ,
    va.prototype.nodeDOM = function(t) {
        var e = this.docView.descAt(t);
        return e ? e.nodeDOM : null
    }
    ,
    va.prototype.posAtDOM = function(t, e, n) {
        void 0 === n && (n = -1);
        var r = this.docView.posFromDOM(t, e, n);
        if (null == r)
            throw new RangeError("DOM position not inside the editor");
        return r
    }
    ,
    va.prototype.endOfTextblock = function(t, e) {
        return re(this, e || this.state, t)
    }
    ,
    va.prototype.destroy = function() {
        this.docView && (mn(this),
        this.destroyPluginViews(),
        this.mounted ? (this.docView.update(this.state.doc, [], Un(this), this),
        this.dom.textContent = "") : this.dom.parentNode && this.dom.parentNode.removeChild(this.dom),
        this.docView.destroy(),
        this.docView = null)
    }
    ,
    va.prototype.dispatchEvent = function(t) {
        return wn(this, t)
    }
    ,
    va.prototype.dispatch = function(t) {
        var e = this._props.dispatchTransaction;
        e ? e.call(this, t) : this.updateState(this.state.apply(t))
    }
    ,
    Object.defineProperties(va.prototype, ga);
    for (var ya = Object.freeze({
        Decoration: la,
        DecorationSet: fa,
        EditorView: va,
        __endComposition: Rn,
        __parseFromClipboard: en,
        __serializeForClipboard: tn
    }), wa = {
        8: "Backspace",
        9: "Tab",
        10: "Enter",
        12: "NumLock",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        44: "PrintScreen",
        45: "Insert",
        46: "Delete",
        59: ";",
        61: "=",
        91: "Meta",
        92: "Meta",
        106: "*",
        107: "+",
        108: ",",
        109: "-",
        110: ".",
        111: "/",
        144: "NumLock",
        145: "ScrollLock",
        160: "Shift",
        161: "Shift",
        162: "Control",
        163: "Control",
        164: "Alt",
        165: "Alt",
        173: "-",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
        229: "q"
    }, ba = wa, ka = {
        48: ")",
        49: "!",
        50: "@",
        51: "#",
        52: "$",
        53: "%",
        54: "^",
        55: "&",
        56: "*",
        57: "(",
        59: ";",
        61: "+",
        173: "_",
        186: ":",
        187: "+",
        188: "<",
        189: "_",
        190: ">",
        191: "?",
        192: "~",
        219: "{",
        220: "|",
        221: "}",
        222: '"',
        229: "Q"
    }, xa = "undefined" != typeof navigator && /Chrome\/(\d+)/.exec(navigator.userAgent), Sa = "undefined" != typeof navigator && /Apple Computer/.test(navigator.vendor), Ma = "undefined" != typeof navigator && /Gecko\/\d+/.test(navigator.userAgent), Ca = "undefined" != typeof navigator && /Mac/.test(navigator.platform), Oa = "undefined" != typeof navigator && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent), Na = xa && (Ca || +xa[1] < 57) || Ma && Ca, Ta = 0; Ta < 10; Ta++)
        wa[48 + Ta] = wa[96 + Ta] = String(Ta);
    for (Ta = 1; Ta <= 24; Ta++)
        wa[Ta + 111] = "F" + Ta;
    for (Ta = 65; Ta <= 90; Ta++)
        wa[Ta] = String.fromCharCode(Ta + 32),
        ka[Ta] = String.fromCharCode(Ta);
    for (var Da in wa)
        ka.hasOwnProperty(Da) || (ka[Da] = wa[Da]);
    var Ea = function(t) {
        var e = !(Na && (t.ctrlKey || t.altKey || t.metaKey) || (Sa || Oa) && t.shiftKey && t.key && 1 == t.key.length) && t.key || (t.shiftKey ? ka : wa)[t.keyCode] || t.key || "Unidentified";
        return "Esc" == e && (e = "Escape"),
        "Del" == e && (e = "Delete"),
        "Left" == e && (e = "ArrowLeft"),
        "Up" == e && (e = "ArrowUp"),
        "Right" == e && (e = "ArrowRight"),
        "Down" == e && (e = "ArrowDown"),
        e
    }
      , Aa = "undefined" != typeof navigator && /Mac/.test(navigator.platform)
      , Ia = Object.freeze({
        keydownHandler: ir,
        keymap: or
    })
      , Ra = function(t, e) {
        this.match = t,
        this.handler = "string" == typeof e ? sr(e) : e
    }
      , za = 500
      , Pa = new Ra(/--$/,"—")
      , Ba = new Ra(/\.\.\.$/,"…")
      , Va = new Ra(/(?:^|[\s\{\[\(\<'"\u2018\u201C])(")$/,"“")
      , $a = new Ra(/"$/,"”")
      , _a = new Ra(/(?:^|[\s\{\[\(\<'"\u2018\u201C])(')$/,"‘")
      , qa = new Ra(/'$/,"’")
      , Fa = [Va, $a, _a, qa]
      , La = Object.freeze({
        InputRule: Ra,
        closeDoubleQuote: $a,
        closeSingleQuote: qa,
        ellipsis: Ba,
        emDash: Pa,
        inputRules: ar,
        openDoubleQuote: Va,
        openSingleQuote: _a,
        smartQuotes: Fa,
        textblockTypeInputRule: ur,
        undoInputRule: lr,
        wrappingInputRule: pr
    })
      , ja = function() {};
    ja.prototype.append = function(t) {
        return t.length ? (t = ja.from(t),
        !this.length && t || t.length < 200 && this.leafAppend(t) || this.length < 200 && t.leafPrepend(this) || this.appendInner(t)) : this
    }
    ,
    ja.prototype.prepend = function(t) {
        return t.length ? ja.from(t).append(this) : this
    }
    ,
    ja.prototype.appendInner = function(t) {
        return new Wa(this,t)
    }
    ,
    ja.prototype.slice = function(t, e) {
        return void 0 === t && (t = 0),
        void 0 === e && (e = this.length),
        t >= e ? ja.empty : this.sliceInner(Math.max(0, t), Math.min(this.length, e))
    }
    ,
    ja.prototype.get = function(t) {
        if (!(t < 0 || t >= this.length))
            return this.getInner(t)
    }
    ,
    ja.prototype.forEach = function(t, e, n) {
        void 0 === e && (e = 0),
        void 0 === n && (n = this.length),
        e <= n ? this.forEachInner(t, e, n, 0) : this.forEachInvertedInner(t, e, n, 0)
    }
    ,
    ja.prototype.map = function(t, e, n) {
        void 0 === e && (e = 0),
        void 0 === n && (n = this.length);
        var r = [];
        return this.forEach(function(e, n) {
            return r.push(t(e, n))
        }, e, n),
        r
    }
    ,
    ja.from = function(t) {
        return t instanceof ja ? t : t && t.length ? new Ja(t) : ja.empty
    }
    ;
    var Ja = function(t) {
        function e(e) {
            t.call(this),
            this.values = e
        }
        t && (e.__proto__ = t),
        (e.prototype = Object.create(t && t.prototype)).constructor = e;
        var n = {
            length: {
                configurable: !0
            },
            depth: {
                configurable: !0
            }
        };
        return e.prototype.flatten = function() {
            return this.values
        }
        ,
        e.prototype.sliceInner = function(t, n) {
            return 0 == t && n == this.length ? this : new e(this.values.slice(t, n))
        }
        ,
        e.prototype.getInner = function(t) {
            return this.values[t]
        }
        ,
        e.prototype.forEachInner = function(t, e, n, r) {
            for (var o = this, i = e; i < n; i++)
                if (!1 === t(o.values[i], r + i))
                    return !1
        }
        ,
        e.prototype.forEachInvertedInner = function(t, e, n, r) {
            for (var o = this, i = e - 1; i >= n; i--)
                if (!1 === t(o.values[i], r + i))
                    return !1
        }
        ,
        e.prototype.leafAppend = function(t) {
            if (this.length + t.length <= 200)
                return new e(this.values.concat(t.flatten()))
        }
        ,
        e.prototype.leafPrepend = function(t) {
            if (this.length + t.length <= 200)
                return new e(t.flatten().concat(this.values))
        }
        ,
        n.length.get = function() {
            return this.values.length
        }
        ,
        n.depth.get = function() {
            return 0
        }
        ,
        Object.defineProperties(e.prototype, n),
        e
    }(ja);
    ja.empty = new Ja([]);
    var Wa = function(t) {
        function e(e, n) {
            t.call(this),
            this.left = e,
            this.right = n,
            this.length = e.length + n.length,
            this.depth = Math.max(e.depth, n.depth) + 1
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.flatten = function() {
            return this.left.flatten().concat(this.right.flatten())
        }
        ,
        e.prototype.getInner = function(t) {
            return t < this.left.length ? this.left.get(t) : this.right.get(t - this.left.length)
        }
        ,
        e.prototype.forEachInner = function(t, e, n, r) {
            var o = this.left.length;
            return !(e < o && !1 === this.left.forEachInner(t, e, Math.min(n, o), r)) && (!(n > o && !1 === this.right.forEachInner(t, Math.max(e - o, 0), Math.min(this.length, n) - o, r + o)) && void 0)
        }
        ,
        e.prototype.forEachInvertedInner = function(t, e, n, r) {
            var o = this.left.length;
            return !(e > o && !1 === this.right.forEachInvertedInner(t, e - o, Math.max(n, o) - o, r + o)) && (!(n < o && !1 === this.left.forEachInvertedInner(t, Math.min(e, o), n, r)) && void 0)
        }
        ,
        e.prototype.sliceInner = function(t, e) {
            if (0 == t && e == this.length)
                return this;
            var n = this.left.length;
            return e <= n ? this.left.slice(t, e) : t >= n ? this.right.slice(t - n, e - n) : this.left.slice(t, n).append(this.right.slice(0, e - n))
        }
        ,
        e.prototype.leafAppend = function(t) {
            var n = this.right.leafAppend(t);
            if (n)
                return new e(this.left,n)
        }
        ,
        e.prototype.leafPrepend = function(t) {
            var n = this.left.leafPrepend(t);
            if (n)
                return new e(n,this.right)
        }
        ,
        e.prototype.appendInner = function(t) {
            return this.left.depth >= Math.max(this.right.depth, t.depth) + 1 ? new e(this.left,new e(this.right,t)) : new e(this,t)
        }
        ,
        e
    }(ja)
      , Ka = ja
      , Ha = function(t, e) {
        this.items = t,
        this.eventCount = e
    };
    Ha.prototype.popEvent = function(t, e) {
        var n = this
          , r = this;
        if (0 == this.eventCount)
            return null;
        for (var o = this.items.length; ; o--)
            if (n.items.get(o - 1).selection) {
                --o;
                break
            }
        var i, s;
        e && (i = this.remapping(o, this.items.length),
        s = i.maps.length);
        var a, c, l = t.tr, p = [], u = [];
        return this.items.forEach(function(t, e) {
            if (!t.step)
                return i || (i = r.remapping(o, e + 1),
                s = i.maps.length),
                s--,
                void u.push(t);
            if (i) {
                u.push(new Ua(t.map));
                var n, h = t.step.map(i.slice(s));
                h && l.maybeStep(h).doc && (n = l.mapping.maps[l.mapping.maps.length - 1],
                p.push(new Ua(n,null,null,p.length + u.length))),
                s--,
                n && i.appendMap(n, s)
            } else
                l.maybeStep(t.step);
            return t.selection ? (a = i ? t.selection.map(i.slice(s)) : t.selection,
            c = new Ha(r.items.slice(0, o).append(u.reverse().concat(p)),r.eventCount - 1),
            !1) : void 0
        }, this.items.length, 0),
        {
            remaining: c,
            transform: l,
            selection: a
        }
    }
    ,
    Ha.prototype.addTransform = function(t, e, n, r) {
        for (var o = [], i = this.eventCount, s = this.items, a = !r && s.length ? s.get(s.length - 1) : null, c = 0; c < t.steps.length; c++) {
            var l = t.steps[c].invert(t.docs[c])
              , p = new Ua(t.mapping.maps[c],l,e)
              , u = void 0;
            (u = a && a.merge(p)) && (p = u,
            c ? o.pop() : s = s.slice(0, s.length - 1)),
            o.push(p),
            e && (i++,
            e = null),
            r || (a = p)
        }
        var h = i - n.depth;
        return h > Qa && (s = hr(s, h),
        i -= h),
        new Ha(s.append(o),i)
    }
    ,
    Ha.prototype.remapping = function(t, e) {
        var n = new zi;
        return this.items.forEach(function(e, r) {
            var o = null != e.mirrorOffset && r - e.mirrorOffset >= t ? n.maps.length - e.mirrorOffset : null;
            n.appendMap(e.map, o)
        }, t, e),
        n
    }
    ,
    Ha.prototype.addMaps = function(t) {
        return 0 == this.eventCount ? this : new Ha(this.items.append(t.map(function(t) {
            return new Ua(t)
        })),this.eventCount)
    }
    ,
    Ha.prototype.rebased = function(t, e) {
        if (!this.eventCount)
            return this;
        var n = []
          , r = Math.max(0, this.items.length - e)
          , o = t.mapping
          , i = t.steps.length
          , s = this.eventCount;
        this.items.forEach(function(t) {
            t.selection && s--
        }, r);
        var a = e;
        this.items.forEach(function(e) {
            var r = o.getMirror(--a);
            if (null != r) {
                i = Math.min(i, r);
                var c = o.maps[r];
                if (e.step) {
                    var l = t.steps[r].invert(t.docs[r])
                      , p = e.selection && e.selection.map(o.slice(a + 1, r));
                    p && s++,
                    n.push(new Ua(c,l,p))
                } else
                    n.push(new Ua(c))
            }
        }, r);
        for (var c = [], l = e; l < i; l++)
            c.push(new Ua(o.maps[l]));
        var p = this.items.slice(0, r).append(c).append(n)
          , u = new Ha(p,s);
        return u.emptyItemCount() > 500 && (u = u.compress(this.items.length - n.length)),
        u
    }
    ,
    Ha.prototype.emptyItemCount = function() {
        var t = 0;
        return this.items.forEach(function(e) {
            e.step || t++
        }),
        t
    }
    ,
    Ha.prototype.compress = function(t) {
        void 0 === t && (t = this.items.length);
        var e = this.remapping(0, t)
          , n = e.maps.length
          , r = []
          , o = 0;
        return this.items.forEach(function(i, s) {
            if (s >= t)
                r.push(i),
                i.selection && o++;
            else if (i.step) {
                var a = i.step.map(e.slice(n))
                  , c = a && a.getMap();
                if (n--,
                c && e.appendMap(c, n),
                a) {
                    var l = i.selection && i.selection.map(e.slice(n));
                    l && o++;
                    var p, u = new Ua(c.invert(),a,l), h = r.length - 1;
                    (p = r.length && r[h].merge(u)) ? r[h] = p : r.push(u)
                }
            } else
                i.map && n--
        }, this.items.length, 0),
        new Ha(Ka.from(r.reverse()),o)
    }
    ,
    Ha.empty = new Ha(Ka.empty,0);
    var Ua = function(t, e, n, r) {
        this.map = t,
        this.step = e,
        this.selection = n,
        this.mirrorOffset = r
    };
    Ua.prototype.merge = function(t) {
        if (this.step && t.step && !t.selection) {
            var e = t.step.merge(this.step);
            if (e)
                return new Ua(e.getMap().invert(),e,this.selection)
        }
    }
    ;
    var Ga = function(t, e, n, r) {
        this.done = t,
        this.undone = e,
        this.prevRanges = n,
        this.prevTime = r
    }
      , Qa = 20
      , Xa = !1
      , Ya = null
      , Za = new hs("history")
      , tc = new hs("closeHistory")
      , ec = Object.freeze({
        HistoryState: Ga,
        closeHistory: function(t) {
            return t.setMeta(tc, !0)
        },
        history: wr,
        redo: kr,
        redoDepth: function(t) {
            var e = Za.getState(t);
            return e ? e.undone.eventCount : 0
        },
        undo: br,
        undoDepth: function(t) {
            var e = Za.getState(t);
            return e ? e.done.eventCount : 0
        }
    })
      , nc = Hr(xr, Sr, Cr)
      , rc = Hr(xr, Nr, Tr)
      , oc = {
        Enter: Hr(Rr, Pr, Br, Vr),
        "Mod-Enter": zr,
        Backspace: nc,
        "Mod-Backspace": nc,
        Delete: rc,
        "Mod-Delete": rc,
        "Mod-a": _r
    }
      , ic = {
        "Ctrl-h": oc.Backspace,
        "Alt-Backspace": oc["Mod-Backspace"],
        "Ctrl-d": oc.Delete,
        "Ctrl-Alt-Backspace": oc["Mod-Delete"],
        "Alt-Delete": oc["Mod-Delete"],
        "Alt-d": oc["Mod-Delete"]
    };
    for (var sc in oc)
        ic[sc] = oc[sc];
    var ac = ("undefined" != typeof navigator ? /Mac/.test(navigator.platform) : "undefined" != typeof os && "darwin" == os.platform()) ? ic : oc
      , cc = Object.freeze({
        autoJoin: function(t, e) {
            if (Array.isArray(e)) {
                var n = e;
                e = function(t) {
                    return n.indexOf(t.type.name) > -1
                }
            }
            return function(n, r) {
                return t(n, r && Kr(r, e))
            }
        },
        baseKeymap: ac,
        chainCommands: Hr,
        createParagraphNear: Pr,
        deleteSelection: xr,
        exitCode: zr,
        joinBackward: Sr,
        joinDown: Ar,
        joinForward: Nr,
        joinUp: Er,
        lift: Ir,
        liftEmptyBlock: Br,
        macBaseKeymap: ic,
        newlineInCode: Rr,
        pcBaseKeymap: oc,
        selectAll: _r,
        selectNodeBackward: Cr,
        selectNodeForward: Tr,
        selectParentNode: $r,
        setBlockType: jr,
        splitBlock: Vr,
        splitBlockKeepMarks: function(t, e) {
            return Vr(t, e && function(n) {
                var r = t.storedMarks || t.selection.$to.parentOffset && t.selection.$from.marks();
                r && n.ensureMarks(r),
                e(n)
            }
            )
        },
        toggleMark: Wr,
        wrapIn: Lr
    })
      , lc = ["p", 0]
      , pc = ["blockquote", 0]
      , uc = ["hr"]
      , hc = ["pre", ["code", 0]]
      , fc = ["br"]
      , dc = {
        doc: {
            content: "block+"
        },
        paragraph: {
            content: "inline*",
            group: "block",
            parseDOM: [{
                tag: "p"
            }],
            toDOM: function() {
                return lc
            }
        },
        blockquote: {
            content: "block+",
            group: "block",
            defining: !0,
            parseDOM: [{
                tag: "blockquote"
            }],
            toDOM: function() {
                return pc
            }
        },
        horizontal_rule: {
            group: "block",
            parseDOM: [{
                tag: "hr"
            }],
            toDOM: function() {
                return uc
            }
        },
        heading: {
            attrs: {
                level: {
                    default: 1
                }
            },
            content: "inline*",
            group: "block",
            defining: !0,
            parseDOM: [{
                tag: "h1",
                attrs: {
                    level: 1
                }
            }, {
                tag: "h2",
                attrs: {
                    level: 2
                }
            }, {
                tag: "h3",
                attrs: {
                    level: 3
                }
            }, {
                tag: "h4",
                attrs: {
                    level: 4
                }
            }, {
                tag: "h5",
                attrs: {
                    level: 5
                }
            }, {
                tag: "h6",
                attrs: {
                    level: 6
                }
            }],
            toDOM: function(t) {
                return ["h" + t.attrs.level, 0]
            }
        },
        code_block: {
            content: "text*",
            marks: "",
            group: "block",
            code: !0,
            defining: !0,
            parseDOM: [{
                tag: "pre",
                preserveWhitespace: "full"
            }],
            toDOM: function() {
                return hc
            }
        },
        text: {
            group: "inline"
        },
        image: {
            inline: !0,
            attrs: {
                src: {},
                alt: {
                    default: null
                },
                title: {
                    default: null
                }
            },
            group: "inline",
            draggable: !0,
            parseDOM: [{
                tag: "img[src]",
                getAttrs: function(t) {
                    return {
                        src: t.getAttribute("src"),
                        title: t.getAttribute("title"),
                        alt: t.getAttribute("alt")
                    }
                }
            }],
            toDOM: function(t) {
                var e = t.attrs;
                return ["img", {
                    src: e.src,
                    alt: e.alt,
                    title: e.title
                }]
            }
        },
        hard_break: {
            inline: !0,
            group: "inline",
            selectable: !1,
            parseDOM: [{
                tag: "br"
            }],
            toDOM: function() {
                return fc
            }
        }
    }
      , mc = ["em", 0]
      , vc = ["strong", 0]
      , gc = ["code", 0]
      , yc = {
        link: {
            attrs: {
                href: {},
                title: {
                    default: null
                }
            },
            inclusive: !1,
            parseDOM: [{
                tag: "a[href]",
                getAttrs: function(t) {
                    return {
                        href: t.getAttribute("href"),
                        title: t.getAttribute("title")
                    }
                }
            }],
            toDOM: function(t) {
                var e = t.attrs;
                return ["a", {
                    href: e.href,
                    title: e.title
                }, 0]
            }
        },
        em: {
            parseDOM: [{
                tag: "i"
            }, {
                tag: "em"
            }, {
                style: "font-style=italic"
            }],
            toDOM: function() {
                return mc
            }
        },
        strong: {
            parseDOM: [{
                tag: "strong"
            }, {
                tag: "b",
                getAttrs: function(t) {
                    return "normal" != t.style.fontWeight && null
                }
            }, {
                style: "font-weight",
                getAttrs: function(t) {
                    return /^(bold(er)?|[5-9]\d{2,})$/.test(t) && null
                }
            }],
            toDOM: function() {
                return vc
            }
        },
        code: {
            parseDOM: [{
                tag: "code"
            }],
            toDOM: function() {
                return gc
            }
        }
    }
      , wc = new yi({
        nodes: dc,
        marks: yc
    })
      , bc = Object.freeze({
        marks: yc,
        nodes: dc,
        schema: wc
    })
      , kc = ["ol", 0]
      , xc = ["ul", 0]
      , Sc = ["li", 0]
      , Mc = {
        attrs: {
            order: {
                default: 1
            }
        },
        parseDOM: [{
            tag: "ol",
            getAttrs: function(t) {
                return {
                    order: t.hasAttribute("start") ? +t.getAttribute("start") : 1
                }
            }
        }],
        toDOM: function(t) {
            return 1 == t.attrs.order ? kc : ["ol", {
                start: t.attrs.order
            }, 0]
        }
    }
      , Cc = {
        parseDOM: [{
            tag: "ul"
        }],
        toDOM: function() {
            return xc
        }
    }
      , Oc = {
        parseDOM: [{
            tag: "li"
        }],
        toDOM: function() {
            return Sc
        },
        defining: !0
    }
      , Nc = Object.freeze({
        addListNodes: function(t, e, n) {
            return t.append({
                ordered_list: Ur(Mc, {
                    content: "list_item+",
                    group: n
                }),
                bullet_list: Ur(Cc, {
                    content: "list_item+",
                    group: n
                }),
                list_item: Ur(Oc, {
                    content: e
                })
            })
        },
        bulletList: Cc,
        liftListItem: Yr,
        listItem: Oc,
        orderedList: Mc,
        sinkListItem: eo,
        splitListItem: Xr,
        wrapInList: Gr
    })
      , Tc = function(t, e) {
        var n = this;
        this.editorView = t,
        this.width = e.width || 1,
        this.color = e.color || "black",
        this.class = e.class,
        this.cursorPos = null,
        this.element = null,
        this.timeout = null,
        this.handlers = ["dragover", "dragend", "drop", "dragleave"].map(function(e) {
            var r = function(t) {
                return n[e](t)
            };
            return t.dom.addEventListener(e, r),
            {
                name: e,
                handler: r
            }
        })
    };
    Tc.prototype.destroy = function() {
        var t = this;
        this.handlers.forEach(function(e) {
            var n = e.name
              , r = e.handler;
            return t.editorView.dom.removeEventListener(n, r)
        })
    }
    ,
    Tc.prototype.update = function(t, e) {
        null != this.cursorPos && e.doc != t.state.doc && this.updateOverlay()
    }
    ,
    Tc.prototype.setCursor = function(t) {
        t != this.cursorPos && (this.cursorPos = t,
        null == t ? (this.element.parentNode.removeChild(this.element),
        this.element = null) : this.updateOverlay())
    }
    ,
    Tc.prototype.updateOverlay = function() {
        var t, e = this.editorView.state.doc.resolve(this.cursorPos);
        if (!e.parent.inlineContent) {
            var n = e.nodeBefore
              , r = e.nodeAfter;
            if (n || r) {
                var o = this.editorView.nodeDOM(this.cursorPos - (n ? n.nodeSize : 0)).getBoundingClientRect()
                  , i = n ? o.bottom : o.top;
                n && r && (i = (i + this.editorView.nodeDOM(this.cursorPos).getBoundingClientRect().top) / 2),
                t = {
                    left: o.left,
                    right: o.right,
                    top: i - this.width / 2,
                    bottom: i + this.width / 2
                }
            }
        }
        if (!t) {
            var s = this.editorView.coordsAtPos(this.cursorPos);
            t = {
                left: s.left - this.width / 2,
                right: s.left + this.width / 2,
                top: s.top,
                bottom: s.bottom
            }
        }
        var a = this.editorView.dom.offsetParent;
        this.element || (this.element = a.appendChild(document.createElement("div")),
        this.class && (this.element.className = this.class),
        this.element.style.cssText = "position: absolute; z-index: 50; pointer-events: none; background-color: " + this.color);
        var c = !a || a == document.body && "static" == getComputedStyle(a).position ? {
            left: -pageXOffset,
            top: -pageYOffset
        } : a.getBoundingClientRect();
        this.element.style.left = t.left - c.left + "px",
        this.element.style.top = t.top - c.top + "px",
        this.element.style.width = t.right - t.left + "px",
        this.element.style.height = t.bottom - t.top + "px"
    }
    ,
    Tc.prototype.scheduleRemoval = function(t) {
        var e = this;
        clearTimeout(this.timeout),
        this.timeout = setTimeout(function() {
            return e.setCursor(null)
        }, t)
    }
    ,
    Tc.prototype.dragover = function(t) {
        if (this.editorView.editable) {
            var e = this.editorView.posAtCoords({
                left: t.clientX,
                top: t.clientY
            });
            if (e) {
                var n = e.pos;
                this.editorView.dragging && this.editorView.dragging.slice && null == (n = st(this.editorView.state.doc, n, this.editorView.dragging.slice)) && (n = e.pos),
                this.setCursor(n),
                this.scheduleRemoval(5e3)
            }
        }
    }
    ,
    Tc.prototype.dragend = function() {
        this.scheduleRemoval(20)
    }
    ,
    Tc.prototype.drop = function() {
        this.scheduleRemoval(20)
    }
    ,
    Tc.prototype.dragleave = function(t) {
        t.target != this.editorView.dom && this.editorView.dom.contains(t.relatedTarget) || this.setCursor(null)
    }
    ;
    var Dc = Object.freeze({
        dropCursor: no
    })
      , Ec = function(t) {
        function e(e) {
            t.call(this, e, e)
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.map = function(n, r) {
            var o = n.resolve(r.map(this.head));
            return e.valid(o) ? new e(o) : t.near(o)
        }
        ,
        e.prototype.content = function() {
            return Qo.empty
        }
        ,
        e.prototype.eq = function(t) {
            return t instanceof e && t.head == this.head
        }
        ,
        e.prototype.toJSON = function() {
            return {
                type: "gapcursor",
                pos: this.head
            }
        }
        ,
        e.fromJSON = function(t, n) {
            if ("number" != typeof n.pos)
                throw new RangeError("Invalid input for GapCursor.fromJSON");
            return new e(t.resolve(n.pos))
        }
        ,
        e.prototype.getBookmark = function() {
            return new Ac(this.anchor)
        }
        ,
        e.valid = function(t) {
            var e = t.parent;
            if (e.isTextblock || !ro(t) || !oo(t))
                return !1;
            var n = e.type.spec.allowGapCursor;
            if (null != n)
                return n;
            var r = e.contentMatchAt(t.index()).defaultType;
            return r && r.isTextblock
        }
        ,
        e.findFrom = function(t, n, r) {
            if (!r && e.valid(t))
                return t;
            for (var o = t.pos, i = null, s = t.depth; ; s--) {
                var a = t.node(s);
                if (n > 0 ? t.indexAfter(s) < a.childCount : t.index(s) > 0) {
                    i = a.maybeChild(n > 0 ? t.indexAfter(s) : t.index(s) - 1);
                    break
                }
                if (0 == s)
                    return null;
                o += n;
                var c = t.doc.resolve(o);
                if (e.valid(c))
                    return c
            }
            for (; i = n > 0 ? i.firstChild : i.lastChild; ) {
                o += n;
                var l = t.doc.resolve(o);
                if (e.valid(l))
                    return l
            }
            return null
        }
        ,
        e
    }(Hi);
    Ec.prototype.visible = !1,
    Hi.jsonID("gapcursor", Ec);
    var Ac = function(t) {
        this.pos = t
    };
    Ac.prototype.map = function(t) {
        return new Ac(t.map(this.pos))
    }
    ,
    Ac.prototype.resolve = function(t) {
        var e = t.resolve(this.pos);
        return Ec.valid(e) ? new Ec(e) : Hi.near(e)
    }
    ;
    var Ic = function() {
        return new ps({
            props: {
                decorations: ao,
                createSelectionBetween: function(t, e, n) {
                    if (e.pos == n.pos && Ec.valid(n))
                        return new Ec(n)
                },
                handleClick: so,
                handleKeyDown: Rc
            }
        })
    }
      , Rc = ir({
        ArrowLeft: io("horiz", -1),
        ArrowRight: io("horiz", 1),
        ArrowUp: io("vert", -1),
        ArrowDown: io("vert", 1)
    })
      , zc = Object.freeze({
        GapCursor: Ec,
        gapCursor: Ic
    })
      , Pc = ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self && self,
    function(t, e) {
        return e = {
            exports: {}
        },
        t(e, e.exports),
        e.exports
    }(function(t, e) {
        !function(e, n) {
            t.exports = n()
        }(0, function() {
            function t() {
                var p, f = arguments, d = f[0], m = f[1], v = 2, g = f.length, y = t[i];
                if (d = t[a](d) ? d : c.createElement(d),
                1 === g)
                    return d;
                if ((!l(m, n) || t[s](m) || u(m)) && (--v,
                m = null),
                g - v == 1 && l(f[v], "string") && void 0 !== d[r])
                    d[r] = f[v];
                else
                    for (; v < g; ++v)
                        if (null != (p = f[v]))
                            if (u(p))
                                for (var w = 0; w < p.length; ++w)
                                    h(d, p[w]);
                            else
                                h(d, p);
                for (var b in m)
                    if (y[b]) {
                        var k = y[b];
                        typeof k === e ? k(d, m[b]) : d[o](k, m[b])
                    } else
                        l(m[b], e) ? d[b] = m[b] : d[o](b, m[b]);
                return d
            }
            var e = "function"
              , n = "object"
              , r = "textContent"
              , o = "setAttribute"
              , i = "attrMap"
              , s = "isNode"
              , a = "isElement"
              , c = typeof document === n ? document : {}
              , l = function(t, e) {
                return typeof t === e
            }
              , p = typeof Node === e ? function(t) {
                return t instanceof Node
            }
            : function(t) {
                return t && l(t, n) && "nodeType"in t && l(t.ownerDocument, n)
            }
              , u = function(t) {
                return t instanceof Array
            }
              , h = function(e, n) {
                u(n) ? n.map(function(t) {
                    h(e, t)
                }) : (t[s](n) || (n = c.createTextNode(n)),
                e.appendChild(n))
            };
            return t[i] = {},
            t[a] = function(e) {
                return t[s](e) && 1 === e.nodeType
            }
            ,
            t[s] = p,
            "undefined" != typeof Proxy && (t.proxy = new Proxy(t,{
                get: function(e, n) {
                    return !(n in t) && (t[n] = t.bind(null, n)),
                    t[n]
                }
            })),
            t
        })
    }))
      , Bc = "http://www.w3.org/2000/svg"
      , Vc = "http://www.w3.org/1999/xlink"
      , $c = "ProseMirror-icon"
      , _c = "ProseMirror-menu"
      , qc = function(t) {
        this.spec = t
    };
    qc.prototype.render = function(t) {
        var e = this.spec
          , n = e.render ? e.render(t) : e.icon ? lo(e.icon) : e.label ? Pc("div", null, uo(t, e.label)) : null;
        if (!n)
            throw new RangeError("MenuItem without icon or label property");
        if (e.title) {
            var r = "function" == typeof e.title ? e.title(t.state) : e.title;
            n.setAttribute("title", uo(t, r))
        }
        return e.class && n.classList.add(e.class),
        e.css && (n.style.cssText += e.css),
        n.addEventListener("mousedown", function(r) {
            r.preventDefault(),
            n.classList.contains(_c + "-disabled") || e.run(t.state, t.dispatch, t, r)
        }),
        {
            dom: n,
            update: function(t) {
                if (e.select) {
                    var r = e.select(t);
                    if (n.style.display = r ? "" : "none",
                    !r)
                        return !1
                }
                var o = !0;
                if (e.enable && (o = e.enable(t) || !1,
                ko(n, _c + "-disabled", !o)),
                e.active) {
                    var i = o && e.active(t) || !1;
                    ko(n, _c + "-active", i)
                }
                return !0
            }
        }
    }
    ;
    var Fc = {
        time: 0,
        node: null
    }
      , Lc = function(t, e) {
        this.options = e || {},
        this.content = Array.isArray(t) ? t : [t]
    };
    Lc.prototype.render = function(t) {
        var e = this
          , n = mo(this.content, t)
          , r = Pc("div", {
            class: _c + "-dropdown " + (this.options.class || ""),
            style: this.options.css
        }, uo(t, this.options.label));
        this.options.title && r.setAttribute("title", uo(t, this.options.title));
        var o = Pc("div", {
            class: _c + "-dropdown-wrap"
        }, r)
          , i = null
          , s = null
          , a = function() {
            i && i.close() && (i = null,
            window.removeEventListener("mousedown", s))
        };
        return r.addEventListener("mousedown", function(t) {
            t.preventDefault(),
            ho(t),
            i ? a() : (i = e.expand(o, n.dom),
            window.addEventListener("mousedown", s = function() {
                fo(o) || a()
            }
            ))
        }),
        {
            dom: o,
            update: function(t) {
                var e = n.update(t);
                return o.style.display = e ? "" : "none",
                e
            }
        }
    }
    ,
    Lc.prototype.expand = function(t, e) {
        var n = Pc("div", {
            class: _c + "-dropdown-menu " + (this.options.class || "")
        }, e)
          , r = !1;
        return t.appendChild(n),
        {
            close: function() {
                if (!r)
                    return r = !0,
                    t.removeChild(n),
                    !0
            },
            node: n
        }
    }
    ;
    var jc = function(t, e) {
        this.options = e || {},
        this.content = Array.isArray(t) ? t : [t]
    };
    jc.prototype.render = function(t) {
        var e = mo(this.content, t)
          , n = Pc("div", {
            class: _c + "-submenu-label"
        }, uo(t, this.options.label))
          , r = Pc("div", {
            class: _c + "-submenu-wrap"
        }, n, Pc("div", {
            class: _c + "-submenu"
        }, e.dom))
          , o = null;
        return n.addEventListener("mousedown", function(t) {
            t.preventDefault(),
            ho(t),
            ko(r, _c + "-submenu-wrap-active"),
            o || window.addEventListener("mousedown", o = function() {
                fo(r) || (r.classList.remove(_c + "-submenu-wrap-active"),
                window.removeEventListener("mousedown", o),
                o = null)
            }
            )
        }),
        {
            dom: r,
            update: function(t) {
                var n = e.update(t);
                return r.style.display = n ? "" : "none",
                n
            }
        }
    }
    ;
    var Jc = {
        join: {
            width: 800,
            height: 900,
            path: "M0 75h800v125h-800z M0 825h800v-125h-800z M250 400h100v-100h100v100h100v100h-100v100h-100v-100h-100z"
        },
        lift: {
            width: 1024,
            height: 1024,
            path: "M219 310v329q0 7-5 12t-12 5q-8 0-13-5l-164-164q-5-5-5-13t5-13l164-164q5-5 13-5 7 0 12 5t5 12zM1024 749v109q0 7-5 12t-12 5h-987q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h987q7 0 12 5t5 12zM1024 530v109q0 7-5 12t-12 5h-621q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h621q7 0 12 5t5 12zM1024 310v109q0 7-5 12t-12 5h-621q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h621q7 0 12 5t5 12zM1024 91v109q0 7-5 12t-12 5h-987q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h987q7 0 12 5t5 12z"
        },
        selectParentNode: {
            text: "⬚",
            css: "font-weight: bold"
        },
        undo: {
            width: 1024,
            height: 1024,
            path: "M761 1024c113-206 132-520-313-509v253l-384-384 384-384v248c534-13 594 472 313 775z"
        },
        redo: {
            width: 1024,
            height: 1024,
            path: "M576 248v-248l384 384-384 384v-253c-446-10-427 303-313 509-280-303-221-789 313-775z"
        },
        strong: {
            width: 805,
            height: 1024,
            path: "M317 869q42 18 80 18 214 0 214-191 0-65-23-102-15-25-35-42t-38-26-46-14-48-6-54-1q-41 0-57 5 0 30-0 90t-0 90q0 4-0 38t-0 55 2 47 6 38zM309 442q24 4 62 4 46 0 81-7t62-25 42-51 14-81q0-40-16-70t-45-46-61-24-70-8q-28 0-74 7 0 28 2 86t2 86q0 15-0 45t-0 45q0 26 0 39zM0 950l1-53q8-2 48-9t60-15q4-6 7-15t4-19 3-18 1-21 0-19v-37q0-561-12-585-2-4-12-8t-25-6-28-4-27-2-17-1l-2-47q56-1 194-6t213-5q13 0 39 0t38 0q40 0 78 7t73 24 61 40 42 59 16 78q0 29-9 54t-22 41-36 32-41 25-48 22q88 20 146 76t58 141q0 57-20 102t-53 74-78 48-93 27-100 8q-25 0-75-1t-75-1q-60 0-175 6t-132 6z"
        },
        em: {
            width: 585,
            height: 1024,
            path: "M0 949l9-48q3-1 46-12t63-21q16-20 23-57 0-4 35-165t65-310 29-169v-14q-13-7-31-10t-39-4-33-3l10-58q18 1 68 3t85 4 68 1q27 0 56-1t69-4 56-3q-2 22-10 50-17 5-58 16t-62 19q-4 10-8 24t-5 22-4 26-3 24q-15 84-50 239t-44 203q-1 5-7 33t-11 51-9 47-3 32l0 10q9 2 105 17-1 25-9 56-6 0-18 0t-18 0q-16 0-49-5t-49-5q-78-1-117-1-29 0-81 5t-69 6z"
        },
        code: {
            width: 896,
            height: 1024,
            path: "M608 192l-96 96 224 224-224 224 96 96 288-320-288-320zM288 192l-288 320 288 320 96-96-224-224 224-224-96-96z"
        },
        link: {
            width: 951,
            height: 1024,
            path: "M832 694q0-22-16-38l-118-118q-16-16-38-16-24 0-41 18 1 1 10 10t12 12 8 10 7 14 2 15q0 22-16 38t-38 16q-8 0-15-2t-14-7-10-8-12-12-10-10q-18 17-18 41 0 22 16 38l117 118q15 15 38 15 22 0 38-14l84-83q16-16 16-38zM430 292q0-22-16-38l-117-118q-16-16-38-16-22 0-38 15l-84 83q-16 16-16 38 0 22 16 38l118 118q15 15 38 15 24 0 41-17-1-1-10-10t-12-12-8-10-7-14-2-15q0-22 16-38t38-16q8 0 15 2t14 7 10 8 12 12 10 10q18-17 18-41zM941 694q0 68-48 116l-84 83q-47 47-116 47-69 0-116-48l-117-118q-47-47-47-116 0-70 50-119l-50-50q-49 50-118 50-68 0-116-48l-118-118q-48-48-48-116t48-116l84-83q47-47 116-47 69 0 116 48l117 118q47 47 47 116 0 70-50 119l50 50q49-50 118-50 68 0 116 48l118 118q48 48 48 116z"
        },
        bulletList: {
            width: 768,
            height: 896,
            path: "M0 512h128v-128h-128v128zM0 256h128v-128h-128v128zM0 768h128v-128h-128v128zM256 512h512v-128h-512v128zM256 256h512v-128h-512v128zM256 768h512v-128h-512v128z"
        },
        orderedList: {
            width: 768,
            height: 896,
            path: "M320 512h448v-128h-448v128zM320 768h448v-128h-448v128zM320 128v128h448v-128h-448zM79 384h78v-256h-36l-85 23v50l43-2v185zM189 590c0-36-12-78-96-78-33 0-64 6-83 16l1 66c21-10 42-15 67-15s32 11 32 28c0 26-30 58-110 112v50h192v-67l-91 2c49-30 87-66 87-113l1-1z"
        },
        blockquote: {
            width: 640,
            height: 896,
            path: "M0 448v256h256v-256h-128c0 0 0-128 128-128v-128c0 0-256 0-256 256zM640 320v-128c0 0-256 0-256 256v256h256v-256h-128c0 0 0-128 128-128z"
        }
    }
      , Wc = new qc({
        title: "Join with above block",
        run: Er,
        select: function(t) {
            return Er(t)
        },
        icon: Jc.join
    })
      , Kc = new qc({
        title: "Lift out of enclosing block",
        run: Ir,
        select: function(t) {
            return Ir(t)
        },
        icon: Jc.lift
    })
      , Hc = new qc({
        title: "Select parent node",
        run: $r,
        select: function(t) {
            return $r(t)
        },
        icon: Jc.selectParentNode
    })
      , Uc = new qc({
        title: "Undo last change",
        run: br,
        enable: function(t) {
            return br(t)
        },
        icon: Jc.undo
    })
      , Gc = new qc({
        title: "Redo last undone change",
        run: kr,
        enable: function(t) {
            return kr(t)
        },
        icon: Jc.redo
    })
      , Qc = "ProseMirror-menubar"
      , Xc = function(t, e) {
        var n = this;
        this.editorView = t,
        this.options = e,
        this.wrapper = Pc("div", {
            class: Qc + "-wrapper"
        }),
        this.menu = this.wrapper.appendChild(Pc("div", {
            class: Qc
        })),
        this.menu.className = Qc,
        this.spacer = null,
        t.dom.parentNode.replaceChild(this.wrapper, t.dom),
        this.wrapper.appendChild(t.dom),
        this.maxHeight = 0,
        this.widthForMaxHeight = 0,
        this.floating = !1;
        var r = go(this.editorView, this.options.content)
          , o = r.dom
          , i = r.update;
        if (this.contentUpdate = i,
        this.menu.appendChild(o),
        this.update(),
        e.floating && !xo()) {
            this.updateFloat();
            var s = Oo(this.wrapper);
            this.scrollFunc = function(t) {
                var e = n.editorView.root;
                (e.body || e).contains(n.wrapper) ? n.updateFloat(t.target.getBoundingClientRect && t.target) : s.forEach(function(t) {
                    return t.removeEventListener("scroll", n.scrollFunc)
                })
            }
            ,
            s.forEach(function(t) {
                return t.addEventListener("scroll", n.scrollFunc)
            })
        }
    };
    Xc.prototype.update = function() {
        this.contentUpdate(this.editorView.state),
        this.floating ? this.updateScrollCursor() : (this.menu.offsetWidth != this.widthForMaxHeight && (this.widthForMaxHeight = this.menu.offsetWidth,
        this.maxHeight = 0),
        this.menu.offsetHeight > this.maxHeight && (this.maxHeight = this.menu.offsetHeight,
        this.menu.style.minHeight = this.maxHeight + "px"))
    }
    ,
    Xc.prototype.updateScrollCursor = function() {
        var t = this.editorView.root.getSelection();
        if (t.focusNode) {
            var e = t.getRangeAt(0).getClientRects()
              , n = e[Mo(t) ? 0 : e.length - 1];
            if (n) {
                var r = this.menu.getBoundingClientRect();
                if (n.top < r.bottom && n.bottom > r.top) {
                    var o = Co(this.wrapper);
                    o && (o.scrollTop -= r.bottom - n.top)
                }
            }
        }
    }
    ,
    Xc.prototype.updateFloat = function(t) {
        var e = this.wrapper
          , n = e.getBoundingClientRect()
          , r = t ? Math.max(0, t.getBoundingClientRect().top) : 0;
        if (this.floating)
            if (n.top >= r || n.bottom < this.menu.offsetHeight + 10)
                this.floating = !1,
                this.menu.style.position = this.menu.style.left = this.menu.style.top = this.menu.style.width = "",
                this.menu.style.display = "",
                this.spacer.parentNode.removeChild(this.spacer),
                this.spacer = null;
            else {
                var o = (e.offsetWidth - e.clientWidth) / 2;
                this.menu.style.left = n.left + o + "px",
                this.menu.style.display = n.top > window.innerHeight ? "none" : "",
                t && (this.menu.style.top = r + "px")
            }
        else if (n.top < r && n.bottom >= this.menu.offsetHeight + 10) {
            this.floating = !0;
            var i = this.menu.getBoundingClientRect();
            this.menu.style.left = i.left + "px",
            this.menu.style.width = i.width + "px",
            t && (this.menu.style.top = r + "px"),
            this.menu.style.position = "fixed",
            this.spacer = Pc("div", {
                class: Qc + "-spacer",
                style: "height: " + i.height + "px"
            }),
            e.insertBefore(this.spacer, this.menu)
        }
    }
    ,
    Xc.prototype.destroy = function() {
        this.wrapper.parentNode && this.wrapper.parentNode.replaceChild(this.editorView.dom, this.wrapper)
    }
    ;
    var Yc = Object.freeze({
        Dropdown: Lc,
        DropdownSubmenu: jc,
        MenuItem: qc,
        blockTypeItem: bo,
        icons: Jc,
        joinUpItem: Wc,
        liftItem: Kc,
        menuBar: So,
        redoItem: Gc,
        renderGrouped: go,
        selectParentNodeItem: Hc,
        undoItem: Uc,
        wrapItem: wo
    })
      , Zc = "ProseMirror-prompt"
      , tl = function(t) {
        this.options = t
    };
    tl.prototype.read = function(t) {
        return t.value
    }
    ,
    tl.prototype.validateType = function(t) {}
    ,
    tl.prototype.validate = function(t) {
        return !t && this.options.required ? "Required field" : this.validateType(t) || this.options.validate && this.options.validate(t)
    }
    ,
    tl.prototype.clean = function(t) {
        return this.options.clean ? this.options.clean(t) : t
    }
    ;
    var el = function(t) {
        function e() {
            t.apply(this, arguments)
        }
        return t && (e.__proto__ = t),
        e.prototype = Object.create(t && t.prototype),
        e.prototype.constructor = e,
        e.prototype.render = function() {
            var t = document.createElement("input");
            return t.type = "text",
            t.placeholder = this.options.label,
            t.value = this.options.value || "",
            t.autocomplete = "off",
            t
        }
        ,
        e
    }(tl)
      , nl = "undefined" != typeof navigator && /Mac/.test(navigator.platform)
      , rl = Object.freeze({
        buildInputRules: Jo,
        buildKeymap: $o,
        buildMenuItems: Vo,
        exampleSetup: function(t) {
            var e = [Jo(t.schema), or($o(t.schema, t.mapKeys)), or(ac), no(), Ic()];
            return !1 !== t.menuBar && e.push(So({
                floating: !1 !== t.floatingMenu,
                content: t.menuContent || Vo(t.schema).fullMenu
            })),
            !1 !== t.history && e.push(wr()),
            e.concat(new ps({
                props: {
                    attributes: {
                        class: "ProseMirror-example-setup-style"
                    }
                }
            }))
        }
    });
    window.PM = {
        model: Di,
        transform: Wi,
        state: fs,
        view: ya,
        keymap: Ia,
        inputrules: La,
        history: ec,
        commands: cc,
        schema_basic: bc,
        schema_list: Nc,
        dropcursor: Dc,
        menu: Yc,
        example_setup: rl,
        gapcursor: zc
    }
}();
