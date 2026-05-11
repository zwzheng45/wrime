require("tools/metatable")

local pin_word_records = require("pin_word_record")

local pin_word = {}

function pin_word.processor(key, env)
	return 2 -- kNoop: web build keeps static pin records but disables local file writes.
end

function pin_word.filter(input, env)
	local input_code = env.engine.context:get_commit_text()
	local pin_cands = {}
	local other_cands = {}
	for cand in input:iter() do
		local pin_word_tab = pin_word_records[input_code] or nil
		if pin_word_tab and table.find_index(pin_word_tab, cand.text) then
			if #pin_cands < #pin_word_tab then
				table.insert(pin_cands, cand)
			end
			if #pin_cands == #pin_word_tab then
				for i, word in ipairs(pin_word_tab) do
					if pin_cands[i].text ~= word then
						for j, pcand in ipairs(pin_cands) do
							if pcand.text == word then
								table.insert(pin_cands, i, pcand)
								table.remove(pin_cands, j + 1)
							end
						end
					end
				end
			end
		else
			table.insert(other_cands, cand)
			if #other_cands > 50 then
				break
			end
		end
	end

	if #pin_cands > 0 then
		for _, cand in ipairs(pin_cands) do
			yield(cand)
		end
	end

	for _, cand in ipairs(other_cands) do
		yield(cand)
	end
end

return {
	processor = pin_word.processor,
	filter = pin_word.filter,
}
