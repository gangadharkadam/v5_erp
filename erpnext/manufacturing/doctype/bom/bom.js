// Copyright (c) 2013, Web Notes Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

// On REFRESH
frappe.provide("erpnext.bom");
cur_frm.cscript.refresh = function(doc,dt,dn){
	cur_frm.toggle_enable("item", doc.__islocal);

	if (!doc.__islocal && doc.docstatus<2) {
		cur_frm.add_custom_button(__("Update Cost"), cur_frm.cscript.update_cost,
			"icon-money", "btn-default");
	}

	cur_frm.cscript.with_operations(doc);
	erpnext.bom.set_operation(doc);
}

cur_frm.cscript.update_cost = function() {
	return frappe.call({
		doc: cur_frm.doc,
		method: "update_cost",
		callback: function(r) {
			if(!r.exc) cur_frm.refresh_fields();
		}
	})
}

cur_frm.cscript.with_operations = function(doc) {
	cur_frm.fields_dict["items"].grid.set_column_disp("operation", doc.with_operations);
	cur_frm.fields_dict["items"].grid.toggle_reqd("operation", doc.with_operations);
}

erpnext.bom.set_operation = function(doc) {
	var op_table = doc["operations"] || [];
	var operations = [];

	for (var i=0, j=op_table.length; i<j; i++) {
		operations[i] = (i+1);
	}

	frappe.meta.get_docfield("BOM Item", "operation", cur_frm.docname).options = operations.join("\n");

	refresh_field("items");
}

cur_frm.cscript.operations_remove = function(){
	erpnext.bom.set_operation(doc);
}

cur_frm.add_fetch("item", "description", "description");
cur_frm.add_fetch("item", "stock_uom", "uom");


cur_frm.cscript.hour_rate = function(doc, dt, dn) {
	erpnext.bom.calculate_op_cost(doc);
	erpnext.bom.calculate_total(doc);
}

cur_frm.cscript.time_in_mins = cur_frm.cscript.hour_rate;
cur_frm.cscript.fixed_cycle_cost = cur_frm.cscript.hour_rate;

cur_frm.cscript.item_code = function(doc, cdt, cdn) {
	get_bom_material_detail(doc, cdt, cdn);
}

cur_frm.cscript.bom_no	= function(doc, cdt, cdn) {
	get_bom_material_detail(doc, cdt, cdn);
}

cur_frm.cscript.is_default = function(doc) {
	if (doc.is_default) cur_frm.set_value("is_active", 1);
}

var get_bom_material_detail= function(doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	if (d.item_code) {
		return frappe.call({
			doc: cur_frm.doc,
			method: "get_bom_material_detail",
			args: {
				'item_code': d.item_code,
				'bom_no': d.bom_no != null ? d.bom_no: '',
				'qty': d.qty
			},
			callback: function(r) {
				d = locals[cdt][cdn];
				$.extend(d, r.message);
				refresh_field("items");
				doc = locals[doc.doctype][doc.name];
				erpnext.bom.calculate_rm_cost(doc);
				erpnext.bom.calculate_total(doc);
			},
			freeze: true
		});
	}
}

cur_frm.cscript.qty = function(doc, cdt, cdn) {
	erpnext.bom.calculate_rm_cost(doc);
	erpnext.bom.calculate_total(doc);
}

cur_frm.cscript.rate = function(doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	if (d.bom_no) {
		msgprint(__("You can not change rate if BOM mentioned agianst any item"));
		get_bom_material_detail(doc, cdt, cdn);
	} else {
		erpnext.bom.calculate_rm_cost(doc);
		erpnext.bom.calculate_total(doc);
	}
}

erpnext.bom.calculate_op_cost = function(doc) {
	var op = doc.operations || [];
	doc.operating_cost = 0.0;
	for(var i=0;i<op.length;i++) {
		operating_cost = flt(flt(op[i].hour_rate) * flt(op[i].time_in_mins) / 60, 2);
		frappe.model.set_value('BOM Operation',op[i].name, "operating_cost", operating_cost);

		doc.operating_cost += operating_cost;
	}
	refresh_field('operating_cost');
}

erpnext.bom.calculate_rm_cost = function(doc) {
	var rm = doc.items || [];
	total_rm_cost = 0;
	for(var i=0;i<rm.length;i++) {
		amt =	flt(rm[i].rate) * flt(rm[i].qty);
		set_multiple('BOM Item',rm[i].name, {'amount': amt}, 'items');
		set_multiple('BOM Item',rm[i].name,
			{'qty_consumed_per_unit': flt(rm[i].qty)/flt(doc.quantity)}, 'items');
		total_rm_cost += amt;
	}
	cur_frm.set_value("raw_material_cost", total_rm_cost);
}


// Calculate Total Cost
erpnext.bom.calculate_total = function(doc) {
	total_cost = flt(doc.operating_cost) + flt(doc.raw_material_cost);
	frappe.model.set_value(doc.doctype, doc.name, "total_cost", total_cost);
}


cur_frm.fields_dict['item'].get_query = function(doc) {
 	return{
		query: "erpnext.controllers.queries.item_query"
	}
}

cur_frm.fields_dict['project_name'].get_query = function(doc, dt, dn) {
	return{
		filters:[
			['Project', 'status', 'not in', 'Completed, Cancelled']
		]
	}
}

cur_frm.fields_dict['items'].grid.get_field('item_code').get_query = function(doc) {
	return{
		query: "erpnext.controllers.queries.item_query",
		filters: {
			"name": "!" + cstr(doc.item)
		}
	}
}

cur_frm.fields_dict['items'].grid.get_field('bom_no').get_query = function(doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	return{
		filters:{
			'item': d.item_code,
			'is_active': 1,
			'docstatus': 1
		}
	}
}

cur_frm.cscript.validate = function(doc, dt, dn) {
	erpnext.bom.calculate_op_cost(doc);
	erpnext.bom.calculate_rm_cost(doc);
	erpnext.bom.calculate_total(doc);
}

frappe.ui.form.on("BOM Operation", "operation", function(frm, cdt, cdn) {
	var d = locals[cdt][cdn];

	frappe.call({
		"method": "frappe.client.get",
		args: {
			doctype: "Operation",
			name: d.operation
		},
		callback: function (data) {
			frappe.model.set_value(d.doctype, d.name, "opn_description", data.message.opn_description);
			frappe.model.set_value(d.doctype, d.name, "workstation", data.message.workstation);
			erpnext.bom.set_operation(frm.doc);
		}
	})
});

frappe.ui.form.on("BOM Operation", "workstation", function(frm, cdt, cdn) {
	var d = locals[cdt][cdn];

	frappe.call({
		"method": "frappe.client.get",
		args: {
			doctype: "Workstation",
			name: d.workstation
		},
		callback: function (data) {
			frappe.model.set_value(d.doctype, d.name, "hour_rate", data.message.hour_rate);
			erpnext.bom.calculate_op_cost(frm.doc);
			erpnext.bom.calculate_total(frm.doc);
		}
	})
});
