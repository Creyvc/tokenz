"""Regressions found by running realistic prompts through both local methods (26 October 2026).

Each test is one problem seen in a real output: a requested subtask dropped, layout flattened,
a stray capital letter, or an equation that blocked every edit.
"""
from compressors.nlp_compressor import compress_with_nlp
from compressors.tfidf_compressor import compress_with_tfidf, inspect_tfidf_input
from token_utils import count_tokens

HISTORY = ("What I mainly need you to do is summarize the causes of World War I in 5 bullet points. "
           "I am currently studying for my history exam and I feel a bit stressed about it. "
           "Please focus on alliances, militarism, imperialism and nationalism. "
           "Do not include anything about World War II. "
           "My roommate keeps playing loud music, which makes it hard to concentrate.")
HISTORY_TASK = "What I mainly need you to do is summarize the causes of World War I in 5 bullet points."


def suggested(text, task):
    plan = inspect_tfidf_input(text, task)
    return max(plan["minimum_required_tokens"], int(plan["original_tokens"] * .65))


def test_tfidf_keeps_requests_that_share_no_words_with_the_task():
    result = compress_with_tfidf(HISTORY, HISTORY_TASK, suggested(HISTORY, HISTORY_TASK))
    assert result.status == "review_required"
    assert "Please focus on alliances, militarism, imperialism and nationalism." in result.candidate_text
    assert "Do not include anything about World War II." in result.candidate_text
    assert "roommate" not in result.candidate_text and "stressed" not in result.candidate_text


def test_tfidf_keeps_requests_inside_a_list():
    text = ("Can you please help me write a Python function that removes duplicates from a list?\n"
            "Requirements:\n- Keep the original order of the items.\n- Do not use any external libraries.\n"
            "- Add a short docstring.\nI tried using set() but it messed up the order. My deadline is tomorrow morning.")
    task = "Can you please help me write a Python function that removes duplicates from a list?"
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.status == "review_required"
    for item in ("- Keep the original order of the items.", "- Do not use any external libraries.", "- Add a short docstring."):
        assert item in result.candidate_text


def test_tfidf_keeps_the_text_a_rewrite_task_works_on():
    text = ("I would like you to rewrite this email so it sounds more professional. "
            "Hi Tom, the report is late again, sorry about that, I will send it by Friday. "
            "Keep it under 80 words. It would also be useful if you could suggest a subject line. "
            "I have been really busy with moving house this month.")
    task = "I would like you to rewrite this email so it sounds more professional."
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.status == "review_required"
    assert "Hi Tom, the report is late again, sorry about that, I will send it by Friday." in result.candidate_text
    assert "subject line" in result.candidate_text and "moving house" not in result.candidate_text


def test_tfidf_drops_exact_repeats_and_adds_no_paragraph_breaks():
    text = ("Could you please write a short poem about the ocean for my little sister? "
            "Could you please write a short poem about the ocean for my little sister? "
            "She is 8 years old and loves dolphins. Make it rhyme and keep it under 12 lines. "
            "My laptop battery is almost dead and the café I'm in is very noisy today.")
    task = "Could you please write a short poem about the ocean for my little sister?"
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.candidate_text == ("Could you please write a short poem about the ocean for my little sister? "
                                     "She is 8 years old and loves dolphins. Make it rhyme and keep it under 12 lines.")


def test_tfidf_protected_word_already_in_the_task_does_not_force_background_in():
    text = ('Translate the following sentence into Spanish: "The library opens at nine." Please keep the tone formal. '
            "I am learning Spanish for a trip to Madrid next summer and my friend recommended this tool.")
    task = 'Translate the following sentence into Spanish: "The library opens at nine."'
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.status == "review_required"
    assert "keep the tone formal" in result.candidate_text and "Madrid" not in result.candidate_text


def test_tfidf_keeps_paragraph_breaks_that_were_there():
    text = ("Please give me a simple pasta recipe for two people.\n\nI am vegetarian, so no meat or fish.\n\n"
            "I only have 20 minutes to cook. Last time I tried cooking pasta it was overcooked and my roommate laughed at me.")
    task = "Please give me a simple pasta recipe for two people."
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.candidate_text == ("Please give me a simple pasta recipe for two people.\n\n"
                                     "I am vegetarian, so no meat or fish.\n\nI only have 20 minutes to cook.")


def test_nlp_keeps_list_and_paragraph_layout():
    text = ("Can you please help me write a Python function that removes duplicates from a list?\n"
            "Requirements:\n- Keep the original order of the items.\n- Do not use any external libraries.")
    result = compress_with_nlp(text)
    assert result.candidate_text == ("Help me write a Python function that removes duplicates from a list.\n"
                                     "Requirements:\n- Keep the original order of the items.\n- Do not use any external libraries.")
    recipe = "Please give me a simple pasta recipe for two people.\n\nI am vegetarian, so no meat or fish."
    assert compress_with_nlp(recipe).candidate_text == "Give me a simple pasta recipe for two people.\n\nI am vegetarian, so no meat or fish."


def test_nlp_removing_a_repeated_paragraph_keeps_the_paragraph_break():
    text = "Explain gravity.\n\nExplain gravity.\n\nDescribe mass."
    assert compress_with_nlp(text).candidate_text == "Explain gravity.\n\nDescribe mass."


def test_nlp_does_not_capitalise_a_clause_it_did_not_edit():
    text = ("So I have this essay due and I was wondering if maybe you could help me out with it. "
            "The essay is about climate change and its effects on coral reefs. It needs to be around 500 words. "
            "I really like the ocean and I went scuba diving last year in Thailand which was amazing. "
            "Please include at least two scientific sources. My professor is quite strict about citations.")
    for mode in ("balanced", "aggressive", "maximum"):
        assert " And I was wondering" not in compress_with_nlp(text, mode=mode).candidate_text


def test_one_line_prompt_with_an_equation_can_still_be_edited():
    text = ("Please explain how to solve the equation 3x + 7 = 22 step by step. "
            "My math teacher explained it too fast in class today.")
    result = compress_with_nlp(text)
    assert result.status == "review_required"
    assert result.candidate_text.startswith("Explain how to solve the equation 3x + 7 = 22 step by step.")
    assert "3x + 7 = 22" in result.protected_constraints


def test_short_code_line_is_still_locked_whole():
    text = "Please explain this line.\nx = compute(a, b)"
    result = compress_with_nlp(text)
    assert "x = compute(a, b)" in result.protected_constraints
    assert "x = compute(a, b)" in result.candidate_text
    assert count_tokens(result.candidate_text) <= count_tokens(text)


def test_nlp_removes_a_greeting_with_the_polite_opening():
    text = ("Hey, could you please help me plan a 3-day trip to Tokyo for my family? "
            "We are 2 adults and 1 child who is 6.")
    result = compress_with_nlp(text)
    assert result.candidate_text == "Help me plan a 3-day trip to Tokyo for my family. We are 2 adults and 1 child who is 6."
    # A greeting on its own, with no request after it, is left alone
    assert compress_with_nlp("Hi there, I am a student. Explain gravity.").candidate_text.startswith("Hi there")


def test_tfidf_keeps_a_list_number_with_its_item():
    text = ("Please write a cover letter for a junior designer job.\n1. Mention my 2 years of freelance work.\n"
            "2. Keep it to one page.\n3. Do not mention my salary expectations.\n"
            "I found this job on LinkedIn yesterday while I was on the bus.")
    task = "Please write a cover letter for a junior designer job."
    result = compress_with_tfidf(text, task, suggested(text, task))
    assert result.candidate_text == ("Please write a cover letter for a junior designer job.\n1. Mention my 2 years of freelance work.\n"
                                     "2. Keep it to one page.\n3. Do not mention my salary expectations.")


def test_both_methods_drop_greetings_and_small_talk():
    text = ("Hi! I hope you are doing well today. I would like you to help me prepare for a job interview at a bank. "
            "Please give me 5 common questions and good answers. Thanks in advance!")
    nlp = compress_with_nlp(text)
    assert nlp.candidate_text == ("I would like you to help me prepare for a job interview at a bank. "
                                  "Give me 5 common questions and good answers.")
    task = "I would like you to help me prepare for a job interview at a bank."
    tfidf = compress_with_tfidf(text, task, 200)
    assert "Hi!" not in tfidf.candidate_text and "hope you are doing well" not in tfidf.candidate_text
    assert "5 common questions" in tfidf.candidate_text
    # A greeting that carries a request is not small talk
    assert "Hello" in compress_with_nlp("Hello, explain gravity to me. Use 2 examples.").candidate_text
