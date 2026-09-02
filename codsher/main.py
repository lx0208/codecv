import asyncio  # noqa: I001
import json
from uuid import uuid4

import chainlit as cl
from dotenv import load_dotenv
from src.ai.agent import build_agent

load_dotenv()


@cl.on_chat_start
async def on_chat_start():
    agent = build_agent()
    cl.user_session.set("agent", agent)
    cl.user_session.set("thread_id", str(uuid4()))


def message_text(content) -> str:
    if hasattr(content, "content"):
        return message_text(content.content)
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False, indent=2, default=str)


@cl.on_message
async def on_message(message: cl.Message):
    # on_chat_start 中已经为当前用户创建了 Agent，这里直接从会话中取出。
    # user_session 会隔离不同用户的状态，避免多个会话共用同一个 Agent。
    agent = cl.user_session.get("agent")

    # 用同一个 Chainlit Message 收集模型分段返回的正文。
    # 此处只创建对象，不立即 send()：如果提前发送，最终回答的时间戳会早于
    # Thinking/Tool Step，UI 在流结束后重新排序时就会把 Step 放到回答后面。
    answer = cl.Message(content="")

    # 一个 Agent 运行期间可能产生多条模型消息，例如：
    # 第一次模型消息请求调用工具，第二次模型消息根据工具结果生成最终回答。
    async def show_model_message(model_message):
        # Gemini 没有 reasoning 内容时不创建空的 Thinking Step。
        thinking_step = None

        async def show_reasoning():
            # 需要在这个内层函数中给外层变量赋值，因此使用 nonlocal。
            nonlocal thinking_step

            # reasoning 是异步流，每个 delta 都是一小段思考内容。
            async for delta in model_message.reasoning:
                # 收到第一段 reasoning 时才创建并显示 Thinking Step。
                if thinking_step is None:
                    thinking_step = cl.Step(
                        name="Thinking",
                        type="llm",
                        icon="brain",
                        default_open=False,
                    )
                    await thinking_step.send()

                # 将思考内容逐段推送到已经显示的 Step 中。
                await thinking_step.stream_token(delta)

            # reasoning 流结束后更新一次，结束 Step 的流式状态。
            if thinking_step is not None:
                await thinking_step.update()

        async def show_text():
            # text 是模型面向用户的正文流；所有模型消息的正文都会追加到 answer。
            async for delta in model_message.text:
                await answer.stream_token(delta)

        # 同时消费 reasoning 和正文，避免其中一个流阻塞另一个流。
        await asyncio.gather(show_reasoning(), show_text())

    # 将一次 LangChain 工具调用映射成一个 Chainlit Tool Step。
    async def show_tool_call(tool_call):
        tool_step = cl.Step(
            name=tool_call.tool_name or "Tool",
            type="tool",
            icon="wrench",
            show_input="json",
            default_open=True,
        )

        # 先展示工具名称和输入参数，让用户能立即看到调用已经开始。
        tool_step.input = tool_call.input or {}
        await tool_step.send()

        # 如果工具支持流式输出，就把每段结果实时追加到 Step。
        async for delta in tool_call.output_deltas:
            await tool_step.stream_token(message_text(delta))

        # 工具结束后确定 Step 的最终状态。优先显示错误，其次显示最终输出；
        # 没有返回值时给出完成提示，避免 UI 中出现一个空 Step。
        if tool_call.error:
            tool_step.output = tool_call.error
            tool_step.is_error = True
        elif tool_call.output is not None:
            tool_step.output = message_text(tool_call.output)
        elif not tool_step.output:
            tool_step.output = "工具调用完成。"

        # 保存最终输出，并结束 Tool Step 的流式状态。
        await tool_step.update()

    # 持续消费 Agent 事件流里的所有模型消息。
    async def consume_messages(stream):
        async for model_message in stream.messages:
            await show_model_message(model_message)

    # 持续消费 Agent 事件流里的所有工具调用。
    async def consume_tool_calls(stream):
        tasks = []

        async for tool_call in stream.tool_calls:
            # 每个工具调用使用独立任务，因此并行工具不会互相阻塞 UI 更新。
            tasks.append(asyncio.create_task(show_tool_call(tool_call)))

        # 等待已经创建的 Tool Step 全部处理完毕后再退出消费者。
        if tasks:
            await asyncio.gather(*tasks)

    try:
        # 使用 LangChain v3 事件流运行 Agent。输入格式与 create_agent 的
        # messages state 一致，这里只传入用户本次发送的消息。
        stream = await agent.astream_events(
            {"messages": [{"role": "user", "content": message.content}]},
            version="v3",
        )

        # async with 负责正确关闭事件流；messages 和 tool_calls 必须同时消费，
        # 否则某一类事件可能因为另一类事件无人读取而延迟显示。
        async with stream:
            await asyncio.gather(
                consume_messages(stream),
                consume_tool_calls(stream),
            )

            # 读取本次 Agent 运行的最终输出，同时确保运行完整结束并抛出异常。
            await stream.output()

    except Exception as exc:  # noqa: BLE001
        # 已经输出过部分正文时，保留正文并单独显示错误；否则直接复用 answer
        # 显示错误，避免额外生成一个空的 AI 消息。
        error_text = f"Agent 运行失败：{exc}"
        if answer.content:
            await cl.Message(content=error_text).send()
        else:
            answer.content = error_text
    finally:
        # Chainlit 会在第一次 stream_token() 时临时创建流式消息；结束后调用
        # send() 可以关闭流并持久化。此时生成的时间戳晚于所有 Step，因而最终
        # 回答会稳定显示在 Thinking 和 Tool Step 后面。
        await answer.send()
