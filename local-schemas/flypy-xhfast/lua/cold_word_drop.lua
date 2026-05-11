-- local puts = require("tools/debugtool")
require("tools/string")
require("tools/metatable")
local drop_list = require("cold_word_record/drop_words")
local hide_list = require("cold_word_record/hide_words")
local turndown_freq_list = require("cold_word_record/turndown_freq_words")
local tbls = {
	["drop_list"] = drop_list,
	["hide_list"] = hide_list,
	["turndown_freq_list"] = turndown_freq_list,
}
local cold_word_drop = {}

local function write_word_to_file(record_type)
	return false
end

local function check_encode_matched(cand_code, word, input_code_tbl, reversedb)
	if #cand_code < 1 and utf8.len(word) > 1 then -- 二字词以上的词条反查, 需要逐个字去反查
		local word_cand_code = string.split(word, "")
		for i, v in ipairs(word_cand_code) do
			-- 如有 `[` 引导的辅助码情况,  去掉引导符及之后的所有形码字符
			local char_code = string.gsub(reversedb:lookup(v), "%[%l%l", "")
			local _char_preedit_code = input_code_tbl[i] or " "
			-- 如有 `[` 引导的辅助码情况,  同上, 去掉之
			local char_preedit_code = string.gsub(_char_preedit_code, "%[%l+", "")
			if not string.match(char_code, char_preedit_code) then
				-- 输入编码串和词条反查结果不匹配(考虑到多音字, 开启了模糊音, 纠错音), 返回false, 表示隐藏这个词条
				return false
			end
		end
	end
	-- 输入编码串和词条反查结果匹配, 返回true, 表示对这个词条降频
	return true
end

local function append_word_to_droplist(ctx, action_type, reversedb)
	local word = ctx.word
	local input_code = ctx.code
	local input_code_tbl = string.split(input_code, " ")
	local input_code_str = table.concat(input_code_tbl, "")
	if action_type == "drop" then
		table.insert(drop_list, word) -- 高亮选中的词条插入到 drop_list
		return true
	end

	if action_type == "hide" then
		-- 单字和二字词 如果不匹配 就隐藏
		if not hide_list[word] then
			hide_list[word] = { input_code_str }
			return true
		else
			-- 隐藏的词条如果已经在 hide_list 中, 则将输入串追加到 值表中, 如: ['藏'] = {'chang', 'zhang'}
			if not table.find_index(hide_list[word], input_code_str) then
				table.insert(hide_list[word], input_code_str)
				return true
			else
				return false
			end
		end
	end

	local cand_code = reversedb:lookup(word) or "" -- 反查候选字编码
	-- 二字词 的匹配检查, 匹配返回true, 不匹配返回false
	local match_result = check_encode_matched(cand_code, word, input_code_tbl, reversedb)
	local ccand_code = string.gsub(cand_code, "%[%l%l", "")
	-- 如有 `[` 引导的辅助码情况,  去掉引导符及之后的所有形码字符
	local input_str = string.gsub(input_code, "%[%l+", "")
	-- 单字和二字词 的匹配检查, 如果匹配, 降频
	if string.match(ccand_code, input_str) or match_result then
		if turndown_freq_list[word] then
			table.insert(turndown_freq_list[word], input_code_str)
		else
			turndown_freq_list[word] = { input_code_str }
		end
		return "turndown_freq"
	else
		if append_word_to_droplist(ctx, "hide", reversedb) then
			return "hide"
		end
	end
end

function cold_word_drop.processor(key, env)
	return 2 -- kNoop, 不做任何操作, 交给下个组件处理
end

function cold_word_drop.filter(input, env)
	local engine = env.engine
	-- local context           = engine.context
	-- local input_code        = env.engine.context:get_commit_text()
	local config = engine.schema.config
	local cands = {}
	local i = 1
	local idx = config:get_int("turn_down_freq_config/idx") or 3

	for cand in input:iter() do
		local cpreedit_code = string.gsub(cand.preedit, " ", "")
		local comment = cand.comment or ""
		if i <= idx then
			local tfl = turndown_freq_list[cand.text] or nil
			-- 前三个 候选项排除 要调整词频的词条, 要删的(实际假性删词, 彻底隐藏罢了) 和要隐藏的词条
			if tfl and table.find_index(tfl, cpreedit_code) then
				table.insert(cands, cand)
			elseif
				not (
					table.find_index(drop_list, cand.text)
					or (hide_list[cand.text] and table.find_index(hide_list[cand.text], cpreedit_code))
					or (string.find(comment, "☯")) -- cand.quality == 0.0
				)
			then
				i = i + 1
				yield(cand)
			end
		else
			if not table.find_index(drop_list, cand.text) then
				table.insert(cands, cand)
			end
		end
		if #cands > 50 then
			break
		end
	end
	for _, cand in ipairs(cands) do
		yield(cand)
	end
end

return {
	processor = cold_word_drop.processor,
	filter = cold_word_drop.filter,
}
