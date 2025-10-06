const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
	recipient: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	sender: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User'
	},
	type: {
		type: String,
		required: true,
		enum: [
			'friend.request', 'friend.accept', 'friend.reject',
			'group.invite', 'group.join', 'group.leave', 'group.added', 'group.response',
			'group.transaction', 'group.transaction.debt', 'group.transaction.settled',
			'group.transaction.debt.paid', 'group.transaction.created',
			'group.transaction.updated', 'group.transaction.deleted', 'group.transaction.removed',
			'group.transaction.edited',
			'group.transaction.unsettled', 'group.transaction.status_changed'
		]
	},
	message: {
		type: String,
		required: true
	},
	read: {
		type: Boolean,
		default: false
	},
	readAt: {
		type: Date
	},
	data: {
		type: mongoose.Schema.Types.Mixed
	}
}, {
	timestamps: true
});

// Index để tìm kiếm thông báo nhanh hơn
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
