// Copyright 2013 Joyent, Inc.  All rights reserved.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var stream = require('stream');
var util = require('util');

var assert = require('assert-plus');
var once = require('once');

var auth = require('./auth');
var RpcMessage = require('./message').RpcMessage;
var XDR = require('./xdr').XDR;



///--- Globals

var sprintf = util.format;



///--- API

function RpcCall(opts) {
    assert.object(opts, 'options');

    RpcMessage.call(this, opts);

    this.rpcvers = opts.rpcvers || 2;
    this.prog = opts.prog;
    this.vers = opts.vers;
    this.proc = opts.proc;
    this.auth = opts.auth || {};
    this.verifier = opts.verifier;

    this.type = 0;

    this._buffer = null;

    this._rpc_call = true; // MDB
}
util.inherits(RpcCall, RpcMessage);


// Check for a Unix UID to be allowed
RpcCall.prototype.is_user = function is_user(users) {
    if (typeof (users) === 'number')
        users = [users];

    assert.arrayOfNumber(users, 'user_ids');

    var a = this.auth || {};
    return (a.type === 'unix' &&
            users.some(function (id) {
                return (id === a.uid);
             }));
};


// Check for a Unix GID to be allowed
RpcCall.prototype.is_in_group = function is_in_group(groups) {
    if (typeof (groups) === 'number')
        groups = [groups];

    assert.number(groups, 'group_ids');

    var a = this.auth || {};
    return (a.type === 'unix' &&
            groups.some(function (g) {
                return (g === a.gid ||
                        a.gids.some(function (gid) {
                            return (gid === g);
                        }));
            }));
};


RpcCall.prototype._serialize = function _serialize(size) {
    assert.optionalNumber(size, 'size');

    // - 16 bytes for call header
    // - 8 bytes for auth (TODO, support arbitrary)
    // - 8 bytes for NULL verifier
    var xdr = this.__serialize(32, size);

    xdr.writeInt(this.rpcvers);
    xdr.writeInt(this.prog);
    xdr.writeInt(this.vers);
    xdr.writeInt(this.proc);

    // TODO auth
    xdr.writeDouble(0x00000000);

    xdr.writeDouble(0x00000000); // verifier

    return (xdr);
};


RpcCall.prototype._transform = function _transform(chunk, encoding, cb) {
    if (!Buffer.isBuffer(chunk))
        chunk = new Buffer(chunk, encoding);

    if (this.incoming) {
        if (this._buffer) {
            chunk = Buffer.concat(this._buffer, chunk);
            this._buffer = null;
        }

        if (chunk.length < 16) {
            this._buffer = chunk;
            cb();
            return;
        }

        var xdr = new XDR(chunk);

        this.rpcvers = xdr.readInt();
        this.prog = xdr.readInt();
        this.vers = xdr.readInt();
        this.proc = xdr.readInt();

        // TODO inspect length
        this.auth = auth.parse(xdr);
        this.verifier = auth.parse(xdr);

        if (xdr.remain())
            this.push(xdr.slice());
    } else {
        this.push(chunk);
    }

    cb();
};


RpcCall.prototype.toString = function toString() {
    return (sprintf('[object RpcCall <xid=%d, prog=%d, vers=%d, proc=%d>]',
                    this.xid, this.prog, this.vers, this.proc));
};



///--- Exports

module.exports = {
    RpcCall: RpcCall
};
